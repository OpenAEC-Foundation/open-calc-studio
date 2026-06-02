import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getAppVersion, buildUserAgent } from "../../utils/platform";
import Modal from "./Modal";
import "./FeedbackDialog.css";

const API_URL = "https://open-feedback-studio.pages.dev/api/feedback";
const APP_ID = "open-calc-studio";
const MAX_IMAGES = 3;
const MAX_TOTAL_SIZE = 1024 * 1024; // 1MB
const MAX_MESSAGE = 5000;
const MIN_MESSAGE = 10;

const SENTIMENT_KEYS: Record<number, string> = { 1: "sentimentFrustrated", 2: "sentimentNeutral", 3: "sentimentHappy" };

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

import { storeGet, storeSet, storeDelete } from "../../utils/store";

const FEEDBACK_IDENTITY_KEY = "feedback-identity";

export default function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const { t } = useTranslation("feedback");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [hasSavedIdentity, setHasSavedIdentity] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [sentiment, setSentiment] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion);
    buildUserAgent().then(setUserAgent);
  }, []);

  // Load saved email/name when dialog opens
  useEffect(() => {
    if (open) {
      storeGet<{ email: string; fullName: string }>(FEEDBACK_IDENTITY_KEY).then((saved) => {
        if (saved?.email) {
          setEmail(saved.email);
          setFullName(saved.fullName);
          setHasSavedIdentity(true);
        }
      });
    }
  }, [open]);

  const handleClearSaved = () => {
    void storeDelete(FEEDBACK_IDENTITY_KEY);
    setEmail("");
    setFullName("");
    setHasSavedIdentity(false);
  };

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = isValidEmail && message.length >= MIN_MESSAGE && message.length <= MAX_MESSAGE && status !== "submitting";

  function handleAttach() {
    if (images.length >= MAX_IMAGES) return;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const currentSize = images.reduce((sum, img) => sum + img.file.size, 0);
    const remaining = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, remaining);
    const newImages: { file: File; url: string }[] = [];
    let newSize = currentSize;
    for (const file of toAdd) {
      if (!file.type.startsWith("image/")) continue;
      if (newSize + file.size > MAX_TOTAL_SIZE) break;
      newSize += file.size;
      newImages.push({ file, url: URL.createObjectURL(file) });
    }
    setImages((prev) => [...prev, ...newImages]);
    e.target.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  }

  function resetForm() {
    setCategory("general");
    setMessage("");
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
    setSentiment(null);
    setStatus("idle");
    setErrorMsg("");
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      const sentimentLabel = sentiment ? t(SENTIMENT_KEYS[sentiment]) : undefined;
      const emailVal = email.trim();
      const nameVal = fullName.trim() || undefined;
      let response: Response;

      const ua = userAgent || undefined;
      const ver = appVersion || undefined;

      if (images.length > 0) {
        const formData = new FormData();
        formData.append("app", APP_ID);
        formData.append("email", emailVal);
        if (nameVal) formData.append("fullname", nameVal);
        formData.append("category", category);
        formData.append("message", message.trim());
        if (sentimentLabel) formData.append("sentiment", sentimentLabel);
        if (ver) formData.append("appVersion", ver);
        images.forEach((img) => formData.append("images", img.file));
        response = await fetch(API_URL, {
          method: "POST",
          headers: ua ? { "User-Agent": ua } : {},
          body: formData,
        });
      } else {
        response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(ua ? { "User-Agent": ua } : {}) },
          body: JSON.stringify({
            app: APP_ID,
            email: emailVal,
            fullname: nameVal,
            category,
            message: message.trim(),
            sentiment: sentimentLabel,
            appVersion: ver,
          }),
        });
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Persist email/name for next time
      void storeSet(FEEDBACK_IDENTITY_KEY, { email: email.trim(), fullName: fullName.trim() });
      setHasSavedIdentity(true);
      setStatus("success");
    } catch (e) {
      console.error("Feedback submission failed:", e);
      setStatus("error");
      setErrorMsg(t("errorGeneric"));
    }
  }

  const categories = [
    { key: "general", label: t("categoryGeneral") },
    { key: "bug", label: t("categoryBug") },
    { key: "feature", label: t("categoryFeature") },
  ];

  const sentiments = [
    { value: 1, emoji: "\u{1F61E}", label: t("sentimentFrustrated") },
    { value: 2, emoji: "\u{1F610}", label: t("sentimentNeutral") },
    { value: 3, emoji: "\u{1F60A}", label: t("sentimentHappy") },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("title")} className="feedback-dialog">
      {status === "success" ? (
        <div className="feedback-success">
          <h3>{t("successTitle")}</h3>
          <p>{t("successMessage")}</p>
          <button className="feedback-submit-btn" onClick={resetForm}>{t("sendAnother")}</button>
        </div>
      ) : (
        <div className="feedback-form">
          <div className="feedback-section">
            <div className="feedback-field-row">
              <label className="feedback-field-label">
                {t("email")} <span className="feedback-required">*</span>
                {hasSavedIdentity && (
                  <button className="feedback-clear-saved" onClick={handleClearSaved} title={t("clearSaved")}>&times;</button>
                )}
              </label>
              <input type="email" className="feedback-input" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="feedback-field-row">
              <label className="feedback-field-label">{t("fullName")}</label>
              <input type="text" className="feedback-input" placeholder={t("fullNamePlaceholder")} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          </div>

          <div className="feedback-section">
            <div className="feedback-categories">
              {categories.map((cat) => (
                <button key={cat.key} className={`feedback-category-btn${category === cat.key ? " active" : ""}`} onClick={() => setCategory(cat.key)}>{cat.label}</button>
              ))}
            </div>
          </div>

          <div className="feedback-section">
            <textarea className="feedback-message" placeholder={t("messagePlaceholder")} maxLength={MAX_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className={`feedback-char-count${message.length >= 4500 ? " warning" : ""}`}>{message.length} / {MAX_MESSAGE}</div>
          </div>

          <div className="feedback-section">
            <div className="feedback-images">
              {images.map((img, i) => (
                <div key={i} className="feedback-image-thumb">
                  <img src={img.url} alt="" />
                  <button className="feedback-image-remove" onClick={() => removeImage(i)}>&times;</button>
                </div>
              ))}
            </div>
            {images.length < MAX_IMAGES && (
              <button className="feedback-attach-btn" onClick={handleAttach}>{t("attachImages")}</button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFileChange} />
            <div className="feedback-label">{t("imageLimit")}</div>
          </div>

          <div className="feedback-section">
            <div className="feedback-label">{t("sentiment")}</div>
            <div className="feedback-sentiment">
              {sentiments.map((s) => (
                <button key={s.value} className={`feedback-sentiment-btn${sentiment === s.value ? " active" : ""}`} onClick={() => setSentiment(sentiment === s.value ? null : s.value)} title={s.label}>{s.emoji}</button>
              ))}
            </div>
          </div>

          <button className="feedback-submit-btn" disabled={!canSubmit} onClick={handleSubmit}>
            {status === "submitting" ? t("submitting") : t("submit")}
          </button>

          {status === "error" && <div className="feedback-error">{errorMsg}</div>}
        </div>
      )}
    </Modal>
  );
}
