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
    // Ensure token is still valid with a 2-minute safety margin
    if (token && exp && Date.now() < exp - 120000) {
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

      // Check if we already have an active valid token from a previous sign-in
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
            setLoading(false);
            console.error("Google Auth error:", response);
            return;
          }
          if (response.access_token) {
            setCachedToken(response.access_token, response.expires_in || 3500);
            createPicker(response.access_token);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "" });
    } catch (err) {
      console.error("Failed to load Google Picker:", err);
      setLoading(false);
    }
  }

  function createPicker(accessToken: string) {
    try {
      const docsView = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setEnableDrives(true); // Shared Drive support

      const uploadView = new window.google.picker.DocsUploadView().setIncludeFolders(true);

      const pickerBuilder = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
        .enableFeature(window.google.picker.Feature.SUPPORT_TEAM_DRIVES)
        .setOAuthToken(accessToken)
        .setDeveloperKey(API_KEY)
        .addView(docsView)
        .addView(uploadView)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            setLoading(false);
            if (data.docs && data.docs.length > 0) {
              for (const doc of data.docs) {
                onFileSelect({
                  id: doc.id,
                  name: doc.name,
                  url: doc.url,
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

      const picker = pickerBuilder.build();
      picker.setVisible(true);
    } catch (err) {
      console.error("Error creating Google Picker:", err);
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
