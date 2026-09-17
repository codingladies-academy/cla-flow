import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { projectMembers, projects, tasks, comments } from "@/db/schema";
import { callGemini, checkAiRateLimit, recordAiUsage } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { taskId, action } = body;

    if (!taskId || !action) {
      return NextResponse.json({ error: "Missing taskId or action" }, { status: 400 });
    }

    // Rate limit check
    const rateCheck = await checkAiRateLimit(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
    }

    // 1. Fetch task and check access
    const [task] = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        projectId: tasks.projectId,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Verify user is member of project
    const isMember = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.userId, user.id)))
      .limit(1);

    if (isMember.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let result = "";

    if (action === "summarize") {
      // Fetch recent comments on this task
      const taskComments = await db
        .select({ body: comments.body })
        .from(comments)
        .where(eq(comments.taskId, taskId))
        .limit(10);

      const commentsText = taskComments.map((c) => `- ${c.body}`).join("\n");

      const prompt = `Task Title: ${task.title}
Task Description: ${task.description || "None"}
Comments:
${commentsText || "No comments"}

Please provide a concise 2-3 sentence executive summary of this task's status, objectives, and key discussion points.`;

      result = await callGemini({
        prompt,
        systemInstruction: "You are a concise, helpful agile project assistant. Provide clear, direct summaries without filler words.",
      });
    } else if (action === "subtasks") {
      const prompt = `Task Title: ${task.title}
Task Description: ${task.description || "None"}

Generate 3 to 6 actionable subtasks/checklist items required to complete this task. Format as a clean markdown list with '- [ ] Item name'.`;

      result = await callGemini({
        prompt,
        systemInstruction: "You are an expert software project planner. Break down tasks into realistic, concrete subtasks.",
      });
    } else if (action === "acceptance_criteria") {
      const prompt = `Task Title: ${task.title}
Task Description: ${task.description || "None"}

Generate clear Given/When/Then acceptance criteria or a Definition of Done for this task.`;

      result = await callGemini({
        prompt,
        systemInstruction: "You are a QA and product expert. Create crisp, testable acceptance criteria.",
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Record usage
    await recordAiUsage(user.id, action);

    return NextResponse.json({ result });
  } catch (err: any) {
    console.error("AI Task Assist error:", err);
    return NextResponse.json({ error: err.message || "Failed to process AI request" }, { status: 500 });
  }
}
