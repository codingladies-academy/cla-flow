"use client";

import {
  type GoogleDriveItem,
  getDocTypeColor,
  getDocTypeLabel,
  parseGoogleDriveUrls,
} from "@/lib/google-drive";
import styles from "./GoogleDriveCard.module.css";

export function GoogleDriveCard({
  item,
  className,
}: {
  item: GoogleDriveItem;
  className?: string;
}) {
  const color = getDocTypeColor(item.docType);
  const label = getDocTypeLabel(item.docType);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.card} ${className || ""}`}
      title={`Open ${item.name || label} in Google Drive`}
    >
      <div className={styles.iconWrap} style={{ background: `${color}18`, color }}>
        <DriveIcon docType={item.docType} size={16} />
      </div>
      <div className={styles.content}>
        <span className={styles.title}>{item.name && item.name !== label ? item.name : label}</span>
        <span className={styles.badge}>Google Drive · Open in new tab ↗</span>
      </div>
      <span className={styles.arrow}>↗</span>
    </a>
  );
}

export function GoogleDriveCardList({ text }: { text: string }) {
  const items = parseGoogleDriveUrls(text);
  if (items.length === 0) return null;

  return (
    <div className={styles.cardList}>
      {items.map((item) => (
        <GoogleDriveCard key={item.url} item={item} />
      ))}
    </div>
  );
}

function DriveIcon({ docType, size = 16 }: { docType: string; size?: number }) {
  if (docType === "spreadsheets") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3h18v18H3z" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    );
  }
  if (docType === "presentation") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
  }
  if (docType === "folder") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
