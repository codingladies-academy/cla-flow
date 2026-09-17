"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import styles from "./VoiceDictationButton.module.css";

// Interface for Web Speech API SpeechRecognition
interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

export function VoiceDictationButton({
  onTranscript,
  className = "",
  size = "md",
  title = "Voice Dictation (Speech-to-Text)",
}: {
  onTranscript: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
  title?: string;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  // Keep latest onTranscript without re-creating recognition instance
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (e: any) {
      // If already started or transitioning, ignore
      if (e?.name !== "InvalidStateError") {
        console.warn("Speech recognition start warning:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        const clean = transcript.trim();
        if (clean && onTranscriptRef.current) {
          onTranscriptRef.current(clean);
        }
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' is triggered when the user is thinking/pausing - do not abort!
        if (event.error === "no-speech" || event.error === "audio-capture") {
          return;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          isListeningRef.current = false;
          setIsListening(false);
          console.warn("Microphone permission denied:", event.error);
        }
      };

      recognition.onend = () => {
        // If the user hasn't explicitly stopped listening, automatically restart
        // to prevent Chrome/Edge from cutting off after short silences
        if (isListeningRef.current) {
          setTimeout(() => {
            if (isListeningRef.current) {
              startRecognition();
            }
          }, 100);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [startRecognition]);

  function toggleListening(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!recognitionRef.current) return;

    if (isListening) {
      isListeningRef.current = false;
      setIsListening(false);
      try {
        recognitionRef.current.stop();
      } catch {}
    } else {
      isListeningRef.current = true;
      setIsListening(true);
      startRecognition();
    }
  }

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`${styles.button} ${size === "sm" ? styles.sm : styles.md} ${
        isListening ? styles.listening : ""
      } ${className}`}
      title={isListening ? "Listening continuously... Click to stop" : title}
      aria-label={title}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isListening ? styles.pulseIcon : ""}
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
      {isListening && <span className={styles.activeDot} />}
    </button>
  );
}
