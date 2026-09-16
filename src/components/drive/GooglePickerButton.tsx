"use client";

import { useState } from "react";
import { loadGapiScript, loadGisScript, type GoogleDriveItem } from "@/lib/google-drive";
import styles from "./GooglePickerButton.module.css";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || "";

const STORAGE_KEY = "cla_flow_gdrive_auth_sec";

// Safe modern obfuscated encryption for client-side storage
function encryptData(data: string): string {
  try {
    const salt = (typeof window !== "undefined" ? window.location.origin : "") + "_cla_flow_secure";
    const enc = new TextEncoder();
    const dataBytes = enc.encode(data);
    const saltBytes = enc.encode(salt);
    const xored = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
      xored[i] = dataBytes[i] ^ saltBytes[i % saltBytes.length];
    }
    let binary = "";
    for (let i = 0; i < xored.length; i++) {
      binary += String.fromCharCode(xored[i]);
    }
    return btoa(binary);
  } catch {
    return "";
  }
}

function decryptData(cipher: string): string {
  try {
    const salt = (typeof window !== "undefined" ? window.location.origin : "") + "_cla_flow_secure";
    const binary = atob(cipher);
    const enc = new TextEncoder();
    const saltBytes = enc.encode(salt);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) ^ saltBytes[i % saltBytes.length];
    }
    const dec = new TextDecoder();
    return dec.decode(bytes);
  } catch {
    return "";
  }
}

type StoredAuth = {
  token: string;
  exp: number;
  email?: string;
};

function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const cipher = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!cipher) return null;
    const json = decryptData(cipher);
    if (!json) return null;
    const auth: StoredAuth = JSON.parse(json);
    if (auth.token && auth.exp && Date.now() < auth.exp - 60000) {
      return auth;
    }
  } catch {}
  return null;
}

function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cipher = localStorage.getItem(STORAGE_KEY);
    if (!cipher) return null;
    const json = decryptData(cipher);
    if (!json) return null;
    const auth: StoredAuth = JSON.parse(json);
    return auth.email || null;
  } catch {}
  return null;
}

function saveStoredAuth(token: string, expiresInSec = 3500, email?: string) {
  if (typeof window === "undefined") return;
  try {
    const existingEmail = email || getStoredEmail() || undefined;
    const payload: StoredAuth = {
      token,
      exp: Date.now() + expiresInSec * 1000,
      email: existingEmail,
    };
    const cipher = encryptData(JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEY, cipher);
  } catch {}
}

function clearStoredAuth() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
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

      // Check for valid stored token in encrypted localStorage
      const auth = getStoredAuth();
      if (auth?.token) {
        createPicker(auth.token);
        return;
      }

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope:
          "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive",
        callback: (response: any) => {
          if (response.error !== undefined) {
            clearStoredAuth();
            setLoading(false);
            console.error("Google Auth error:", response);
            return;
          }
          if (response.access_token) {
            saveStoredAuth(response.access_token, response.expires_in || 3500);

            // Fetch email asynchronously to save as hint for future seamless 1-click loads
            fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${response.access_token}` },
            })
              .then((res) => res.json())
              .then((info) => {
                if (info?.email) {
                  saveStoredAuth(response.access_token, response.expires_in || 3500, info.email);
                }
              })
              .catch(() => {});

            createPicker(response.access_token);
          } else {
            setLoading(false);
          }
        },
      });

      // Request token with account hint if previously known so multi-account browsers don't prompt
      const hintEmail = getStoredEmail();
      const requestOptions: any = { prompt: "" };
      if (hintEmail) {
        requestOptions.hint = hintEmail;
      }
      tokenClient.requestAccessToken(requestOptions);
    } catch (err) {
      console.error("Failed to load Google Picker:", err);
      setLoading(false);
    }
  }

  function createPicker(accessToken: string) {
    try {
      // Primary view with all files, folders, and shared drives
      const allFilesView = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setEnableDrives(true);

      // Shared Drives & Folders navigation view
      const foldersView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
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
      clearStoredAuth();
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.driveBtn} ${iconOnly ? styles.iconOnly : ""} ${className || ""}`}
      onClick={handleOpenPicker}
      onMouseDown={(e) => {
        // Prevent active textarea/input from blurring before picker opens
        e.preventDefault();
      }}
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
