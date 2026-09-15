/**
 * Google Drive / Docs / Sheets / Slides URL detector, parser, and Picker helper.
 */

export type GoogleDocType =
  | "document"
  | "spreadsheets"
  | "presentation"
  | "forms"
  | "folder"
  | "file"
  | "drive";

export type GoogleDriveItem = {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  docType: GoogleDocType;
  iconUrl?: string;
};

// Regex patterns to detect Google Drive / Docs URLs in text (including markdown [title](url))
const MARKDOWN_DRIVE_REGEX =
  /\[([^\]]+)\]\((https?:\/\/(?:docs|drive)\.google\.com\/[^\s)]+)\)/gi;

const GOOGLE_URL_REGEX =
  /https?:\/\/(?:docs|drive)\.google\.com\/(?:document\/d\/([a-zA-Z0-9_-]+)|spreadsheets\/d\/([a-zA-Z0-9_-]+)|presentation\/d\/([a-zA-Z0-9_-]+)|forms\/d\/([a-zA-Z0-9_-]+)|drive\/folders\/([a-zA-Z0-9_-]+)|file\/d\/([a-zA-Z0-9_-]+)|drive\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+))[^\s)\]]*/gi;

function getDocTypeFromUrl(url: string): GoogleDocType {
  if (url.includes("/document/")) return "document";
  if (url.includes("/spreadsheets/")) return "spreadsheets";
  if (url.includes("/presentation/")) return "presentation";
  if (url.includes("/forms/")) return "forms";
  if (url.includes("/folders/")) return "folder";
  if (url.includes("/file/")) return "file";
  return "drive";
}

export function parseGoogleDriveUrls(text: string): GoogleDriveItem[] {
  if (!text) return [];
  const items: GoogleDriveItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Check for markdown links: [Title](https://docs.google.com/...)
  const mdMatches = text.matchAll(MARKDOWN_DRIVE_REGEX);
  for (const match of mdMatches) {
    const title = match[1]?.trim();
    const url = match[2]?.trim();
    if (!url || seenUrls.has(url)) continue;

    seenUrls.add(url);
    const docType = getDocTypeFromUrl(url);
    items.push({
      id: url,
      name: title || getDocTypeLabel(docType),
      url,
      docType,
    });
  }

  // 2. Check for raw URLs
  const rawMatches = text.matchAll(GOOGLE_URL_REGEX);
  for (const match of rawMatches) {
    const fullUrl = match[0];
    if (seenUrls.has(fullUrl)) continue;

    seenUrls.add(fullUrl);
    const docType = getDocTypeFromUrl(fullUrl);
    const fileId =
      match[1] ||
      match[2] ||
      match[3] ||
      match[4] ||
      match[5] ||
      match[6] ||
      match[7] ||
      match[8] ||
      fullUrl;

    items.push({
      id: fileId,
      name: getDocTypeLabel(docType),
      url: fullUrl,
      docType,
    });
  }

  return items;
}

export function getDocTypeLabel(docType: GoogleDocType): string {
  switch (docType) {
    case "document":
      return "Google Doc";
    case "spreadsheets":
      return "Google Sheet";
    case "presentation":
      return "Google Slides";
    case "forms":
      return "Google Form";
    case "folder":
      return "Google Drive Folder";
    case "drive":
    case "file":
    default:
      return "Google Drive File";
  }
}

export function getDocTypeColor(docType: GoogleDocType): string {
  switch (docType) {
    case "document":
      return "#4285F4"; // Blue
    case "spreadsheets":
      return "#0F9D58"; // Green
    case "presentation":
      return "#F4B400"; // Yellow/Orange
    case "forms":
      return "#7248B9"; // Purple
    case "folder":
      return "#00897B"; // Teal
    case "drive":
    case "file":
    default:
      return "#4285F4";
  }
}

/* ------------------------------------------------------------------ */
/* Google Picker API Script Loader & Auth Client                      */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let gapiLoadedPromise: Promise<void> | null = null;
let gisLoadedPromise: Promise<void> | null = null;

export function loadGapiScript(): Promise<void> {
  if (gapiLoadedPromise) return gapiLoadedPromise;
  gapiLoadedPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.gapi) return resolve();

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.gapi.load("picker", { callback: resolve });
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return gapiLoadedPromise;
}

export function loadGisScript(): Promise<void> {
  if (gisLoadedPromise) return gisLoadedPromise;
  gisLoadedPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.google?.accounts?.oauth2) return resolve();

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return gisLoadedPromise;
}
