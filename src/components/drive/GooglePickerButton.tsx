"use client";

import { useState } from "react";
import { loadGapiScript, loadGisScript, type GoogleDriveItem } from "@/lib/google-drive";
import styles from "./GooglePickerButton.module.css";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || "";

const TOKEN_KEY = "cla_flow_gdrive_token";
const TOKEN_EXP_KEY = "cla_flow_gdrive_token_exp";

function getCachedToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(TOKEN_EXP_KEY) || 0);
    if (token && exp && Date.now() < exp - 60000) {
      return token;
    }
  } catch {}
  return null;
}

function setCachedToken(token: string, expiresInSec = 3500) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + expiresInSec * 1000));
  } catch {}
}

function clearCachedToken() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
  } catch {}
}

export function GooglePickerButton({
  onFileSelect,
  label = "Drive",
  iconOnly = false,
  className,
}: {
  onFileSelect: (item: { name: string; url: string; id: string; mimeType?: string }) => void;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleOpenPicker() {
    if (!CLIENT_ID || !API_KEY) {
      const url = prompt(
        "Paste Google Docs / Sheets / Drive URL (or configure NEXT_PUBLIC_GOOGLE_CLIENT_ID & API_KEY for 1-click picker):",
      );
      if (url && url.trim()) {
        const cleanUrl = url.trim();
        onFileSelect({
          id: cleanUrl,
          name: "Google Drive File",
          url: cleanUrl,
        });
      }
      return;
    }

    try {
      setLoading(true);
      await Promise.all([loadGapiScript(), loadGisScript()]);

      // Check for cached token so user isn't asked to sign in every time
      const validToken = getCachedToken();
      if (validToken) {
        createPicker(validToken);
        return;
      }

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope:
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive",
        callback: (response: any) => {
          if (response.error !== undefined) {
            clearCachedToken();
            setLoading(false);
            console.error("Google Auth error:", response);
            return;
          }
          if (response.access_token) {
            setCachedToken(response.access_token, response.expires_in || 3500);
            createPicker(response.access_token);
          } else {
            setLoading(false);
          }
        },
      });

      // Try silent request first if already authenticated, or show prompt
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (err) {
      console.error("Failed to load Google Picker:", err);
      setLoading(false);
    }
  }

  function createPicker(accessToken: string) {
    try {
      // Primary view with all files, folders, and shared drives selectable
      const allFilesView = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectableMimeTypes(
          "application/vnd.google-apps.folder,application/vnd.google-apps.shortcut,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation,application/vnd.google-apps.form,application/vnd.google-apps.site,application/vnd.google-apps.drawing,application/pdf,image/*,video/*,audio/*,text/*,application/*"
        )
        .setEnableDrives(true);

      // Shared Drives & Folders navigation view
      const foldersView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectableMimeTypes(
          "application/vnd.google-apps.folder,application/vnd.google-apps.shortcut,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation,application/vnd.google-apps.form,application/pdf,image/*,video/*,audio/*,text/*,application/*"
        )
        .setEnableDrives(true);

      const uploadView = new window.google.picker.DocsUploadView().setIncludeFolders(true);

      const pickerBuilder = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
        .enableFeature(window.google.picker.Feature.SUPPORT_TEAM_DRIVES)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken)
        .setDeveloperKey(API_KEY)
        .addView(allFilesView)
        .addView(foldersView)
        .addView(uploadView)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            setLoading(false);
            if (data.docs && data.docs.length > 0) {
              for (const doc of data.docs) {
                const name = doc.name || doc[window.google.picker.Document.NAME] || "Google Drive Item";
                let url = doc.url || doc[window.google.picker.Document.URL];
                if (!url) {
                  if (
                    doc.mimeType === "application/vnd.google-apps.folder" ||
                    doc.type === "folder"
                  ) {
                    url = `https://drive.google.com/drive/folders/${doc.id}`;
                  } else {
                    url = `https://drive.google.com/file/d/${doc.id}/view`;
                  }
                }
                onFileSelect({
                  id: doc.id,
                  name,
                  url,
                  mimeType: doc.mimeType,
                });
              }
            }
          } else if (data.action === window.google.picker.Action.CANCEL) {
            setLoading(false);
          }
        });

      if (APP_ID) {
        pickerBuilder.setAppId(APP_ID);
      }

      if (typeof window !== "undefined" && window.location.origin) {
        pickerBuilder.setOrigin(window.location.origin);
      }

      const picker = pickerBuilder.build();
      picker.setVisible(true);
    } catch (err) {
      console.error("Error creating Google Picker:", err);
      clearCachedToken();
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.driveBtn} ${iconOnly ? styles.iconOnly : ""} ${className || ""}`}
      onClick={handleOpenPicker}
      disabled={loading}
      title="Attach from Google Drive / Shared Drive"
      aria-label="Attach from Google Drive / Shared Drive"
    >
      <GoogleDriveIcon size={14} />
      {!iconOnly && <span>{loading ? "Connecting..." : label}</span>}
    </button>
  );
}

function GoogleDriveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M8.01 4L1.75 14.85l3.65 6.32 6.26-10.85L8.01 4z"
        fill="#FFC107"
      />
      <path
        d="M22.25 14.85H9.75l-3.65 6.32h12.5l3.65-6.32z"
        fill="#2196F3"
      />
      <path
        d="M15.99 4H8.01l6.26 10.85 7.98-.01L15.99 4z"
        fill="#4CAF50"
      />
    </svg>
  );
}
