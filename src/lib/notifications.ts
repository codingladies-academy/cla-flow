import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks, users, taskValues, properties } from "@/db/schema";
import { emailSender } from "@/lib/emailSender";
import { sendPushToUser } from "@/lib/push-server";

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://flow.codingladies.org";
}

/**
 * Notifies a user when they are added to a project.
 */
export async function notifyAddedToProject({
  projectId,
  userId,
  actorId,
}: {
  projectId: string;
  userId: string;
  actorId: string;
}) {
  try {
    if (userId === actorId) return;

    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return;

    const [actor] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const projectName = project?.name || "a project";
    const actorName = actor?.name || "A team member";
    const projectUrl = `${getAppUrl()}/p/${projectId}`;

    // Send Web Push Notification
    sendPushToUser(userId, {
      title: `Added to ${projectName}`,
      body: `${actorName} added you to the project ${projectName}.`,
      url: projectUrl,
    }).catch(() => {});

    if (!user.email) return;

    await emailSender.sendEmail({
      to: user.email,
      email: user.email,
      subject: `You've been added to ${projectName} on CLA Flow`,
      first_name: user.name.split(" ")[0] || user.name,
      html: `
        <p>Hello <strong>${user.name}</strong>,</p>
        <p><strong>${actorName}</strong> added you to the project <strong>${projectName}</strong> on CLA Flow.</p>
        <p style="color: #666666; font-size: 13px;">You can now view the project board, manage tasks, and collaborate with your team.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${projectUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Open Project</a>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send added to project notification:", err);
  }
}

/**
 * Notifies a user when they are assigned to a task.
 */
export async function notifyTaskAssigned({
  projectId,
  taskId,
  assigneeId,
  actorId,
}: {
  projectId: string;
  taskId: string;
  assigneeId: string | string[];
  actorId: string;
}) {
  try {
    const ids = Array.isArray(assigneeId) ? assigneeId : [assigneeId];
    const targetIds = ids.filter((id) => id && id !== actorId);
    if (!targetIds.length) return;

    const [actor] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    const [project] = await db
      .select({ name: projects.name, key: projects.key })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const [task] = await db
      .select({ number: tasks.number, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return;

    const taskKey = project?.key ? `${project.key}-${task.number}` : `#${task.number}`;
    const projectName = project?.name || "Project";
    const actorName = actor?.name || "A team member";
    const taskUrl = `${getAppUrl()}/p/${projectId}?task=${taskId}`;

    for (const id of targetIds) {
      const [assignee] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!assignee) continue;

      // Push notification
      sendPushToUser(id, {
        title: `Assigned: ${taskKey}`,
        body: `${actorName} assigned you to "${task.title}" in ${projectName}`,
        url: taskUrl,
      }).catch(() => {});

      if (!assignee.email) continue;

      await emailSender.sendEmail({
        to: assignee.email,
        email: assignee.email,
        subject: `Assigned to ${taskKey}: ${task.title}`,
        first_name: assignee.name.split(" ")[0] || assignee.name,
        html: `
          <p>Hello <strong>${assignee.name}</strong>,</p>
          <p><strong>${actorName}</strong> assigned you to a task in <strong>${projectName}</strong>:</p>
          <div style="background: #f0fdfa; border-left: 4px solid #00BFB3; border-radius: 6px; padding: 14px 18px; margin: 18px 0;">
            <div style="font-size: 12px; font-weight: bold; color: #00BFB3; margin-bottom: 4px;">${taskKey}</div>
            <div style="font-size: 15px; font-weight: 600; color: #111827;">${task.title}</div>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${taskUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">View Task</a>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error("Failed to send task assigned notification:", err);
  }
}

/**
 * Notifies task assignee / task creator when a comment is posted.
 */
export async function notifyComment({
  projectId,
  taskId,
  commentBody,
  authorId,
}: {
  projectId: string;
  taskId: string;
  commentBody: string;
  authorId: string;
}) {
  try {
    const [task] = await db
      .select({ number: tasks.number, title: tasks.title, createdBy: tasks.createdBy })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return;

    const [project] = await db
      .select({ name: projects.name, key: projects.key })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);

    const taskKey = project?.key ? `${project.key}-${task.number}` : `#${task.number}`;
    const authorName = author?.name || "A team member";
    const taskUrl = `${getAppUrl()}/p/${projectId}?task=${taskId}`;

    // Collect recipients: task creator and any person assigned to the task
    const recipientIds = new Set<string>();
    if (task.createdBy && task.createdBy !== authorId) {
      recipientIds.add(task.createdBy);
    }

    // Check if task has an assignee stored in taskValues
    const personValues = await db
      .select({ value: taskValues.value })
      .from(taskValues)
      .innerJoin(properties, eq(taskValues.propertyId, properties.id))
      .where(and(eq(taskValues.taskId, taskId), eq(properties.type, "person")));

    for (const pv of personValues) {
      if (typeof pv.value === "string" && pv.value && pv.value !== authorId) {
        recipientIds.add(pv.value);
      } else if (Array.isArray(pv.value)) {
        for (const id of pv.value) {
          if (typeof id === "string" && id && id !== authorId) {
            recipientIds.add(id);
          }
        }
      }
    }

    if (recipientIds.size === 0) return;

    const preview =
      commentBody.length > 200 ? commentBody.slice(0, 197) + "…" : commentBody;

    for (const recipientId of recipientIds) {
      const [recipient] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, recipientId))
        .limit(1);

      if (!recipient) continue;

      // Push notification
      sendPushToUser(recipientId, {
        title: `Comment on ${taskKey}`,
        body: `${authorName}: ${preview}`,
        url: taskUrl,
      }).catch(() => {});

      if (!recipient.email) continue;

      await emailSender.sendEmail({
        to: recipient.email,
        email: recipient.email,
        subject: `New comment on ${taskKey}: ${task.title}`,
        first_name: recipient.name.split(" ")[0] || recipient.name,
        html: `
          <p>Hello <strong>${recipient.name}</strong>,</p>
          <p><strong>${authorName}</strong> commented on <strong>${taskKey}</strong> (${task.title}):</p>
          <div style="background: #f8fafc; border-left: 4px solid #64748b; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-style: italic; color: #334155;">
            "${preview}"
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${taskUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Reply on Task</a>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error("Failed to send comment notification:", err);
  }
}
