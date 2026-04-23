import { FormEvent, useState } from "react";
import type { AuthMode } from "../state/types";

interface UnlockScreenProps {
  mode: AuthMode;
  errorMessage: string;
  onSubmit: (password: string) => Promise<boolean>;
}

export function UnlockScreen({
  mode,
  errorMessage,
  onSubmit,
}: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSetup = mode === "setup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSetup && password !== confirmPassword) {
      return;
    }

    setSubmitting(true);
    const ok = await onSubmit(password);
    setSubmitting(false);

    if (ok) {
      setPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <section className="unlock-card">
      <div className="unlock-card__glow" />
      <p className="unlock-card__eyebrow">Dream Diary</p>
      <h1>{isSetup ? "为这本日记设置本地密码" : "输入密码，翻开今天的书页"}</h1>
      <p className="unlock-card__desc">
        {isSetup
          ? "密码会用于本地解锁与正文加密。首版保持离线，不做账号系统。"
          : "输入正确密码后才会读取本地内容。即使应用重启，也不会直接显示正文。"}
      </p>

      <form className="unlock-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>密码</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="输入 8 位以上密码"
          />
        </label>

        {isSetup ? (
          <label className="field">
            <span>确认密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入同一密码"
            />
          </label>
        ) : null}

        {isSetup && password && confirmPassword && password !== confirmPassword ? (
          <p className="inline-error">两次输入的密码不一致。</p>
        ) : null}

        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

        <button
          className="primary-button"
          disabled={
            submitting ||
            !password ||
            (isSetup && (!confirmPassword || password !== confirmPassword))
          }
          type="submit"
        >
          {submitting ? "处理中..." : isSetup ? "设置并进入日记本" : "解锁日记本"}
        </button>
      </form>
    </section>
  );
}
