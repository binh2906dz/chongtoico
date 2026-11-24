import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { ErrorBox, Spinner } from "../../components/ui";

/**
 * Opt-out page opened from the "Từ chối nhận" button in a Telegram message.
 *
 * The visitor confirms once; the Telegram id is then marked so the scheduler
 * never creates another job for that person.
 */
export default function Stop() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function optOut() {
    const tid = Number(params.get("tid"));
    if (!tid) {
      setError("Link không hợp lệ.");
      setState("error");
      return;
    }
    setState("busy");
    try {
      await api("/api/telegram/optout-public", { body: { tid } });
      setState("done");
    } catch (err) {
      setError(errorMessage(err));
      setState("error");
    }
  }

  useEffect(() => {
    const tid = Number(params.get("tid"));
    if (tid && state === "idle") void optOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="panel p-6 text-center">
        <h1 className="mb-2 text-lg font-black">Từ chối nhận tin nhắn</h1>
        {state === "busy" && <Spinner label="Đang xử lý..." />}
        {state === "done" && (
          <>
            <p className="mb-4 text-sm text-emerald-300">
              ✅ Đã từ chối nhận. Bạn sẽ không còn nhận tin nhắn từ Chống Tối Cổ nữa.
            </p>
            <Link to="/" className="btn-primary block w-full">
              Về trang chủ
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <ErrorBox message={error} />
            <div className="mt-4 space-y-2">
              <button onClick={() => void optOut()} className="btn-primary w-full">
                Thử lại
              </button>
              <Link to="/" className="btn-ghost block w-full">
                Về trang chủ
              </Link>
            </div>
          </>
        )}
        {state === "idle" && (
          <>
            <p className="mb-4 text-sm text-muted">Bạn có chắc muốn ngừng nhận tin nhắn?</p>
            <button onClick={() => void optOut()} className="btn-primary w-full">
              🔕 Từ chối nhận
            </button>
          </>
        )}
      </div>
    </div>
  );
}
