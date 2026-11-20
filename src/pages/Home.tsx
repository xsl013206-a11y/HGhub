import { useCallback, useEffect, useRef, useState } from "react";
import Feed from "../components/Feed";
import { api } from "../api";
import type { VideoCard } from "../types";
import { useStore } from "../store";
import { ISearch } from "../icons";
import { Empty } from "../components/ui";

export default function Home({ active, bottomInset }: { active: boolean; bottomInset: number }) {
  const { toast } = useStore();
  const [items, setItems] = useState<VideoCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);
  /** 上游总页数（首次探测得到） */
  const pagesRef = useRef(0);
  /** 本次随机落地的起始页 */
  const startRef = useRef(1);
  /** 走到末页后是否已经回绕到第 1 页 */
  const wrappedRef = useRef(false);
  /** 下一页页码，0 表示没有下一页 */
  const nextRef = useRef(1);
  const bootedRef = useRef(false);

  const load = useCallback(async (p: number) => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const res = await api.feed(p, 10);
      const list = res?.items || [];
      const pages = res?.pagination?.pages || 0;
      if (pages) pagesRef.current = pages;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...list.filter((x) => !seen.has(x.id))];
      });

      // 下一页：走到末页就回绕到第 1 页，绕回起始页才算刷完（重复项由上面的 id 去重挡住）
      let next: number | null = p + 1;
      if (pages && p >= pages) {
        if (!wrappedRef.current) {
          wrappedRef.current = true;
          next = 1;
        } else if (p >= startRef.current - 1) {
          next = null;
        } else {
          next = p + 1;
        }
      }
      if (!list.length) next = null;
      nextRef.current = next ?? 0;
      setDone(next === null);
    } catch (e) {
      const message = (e as Error).message || "加载失败";
      setError(message);
      toast(message, "info");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [done, toast]);

  // 首屏：先用 size=1 探一次拿到总页数，再随机落地到某一页，
  // 这样每次打开的第一条都不一样（上游固定排序，只能从页码上换入口）。
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void (async () => {
      let start = 1;
      try {
        const probe = await api.feed(1, 1);
        const pages = probe?.pagination?.pages || 1;
        pagesRef.current = pages;
        start = pages > 1 ? 1 + Math.floor(Math.random() * pages) : 1;
      } catch {
        // 探测失败就按第 1 页走，真正的错误交给 load 报出来
      }
      startRef.current = start;
      nextRef.current = start;
      await load(start);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ids = items.map((v) => v.id);

  return (
    <div className="absolute inset-0 bg-black">
      {items.length ? (
        <Feed videoIds={ids} mode="home" active={active} bottomInset={bottomInset}
          onNearEnd={() => { if (!loading && !done && nextRef.current) void load(nextRef.current); }} />
      ) : !loading && error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-bg">
          <Empty icon={<ISearch size={26} />} title="首页加载失败" sub={error} action="重试" onAction={() => void load(startRef.current)} />
        </div>
      ) : !loading && done ? (
        <div className="absolute inset-0 flex items-center justify-center bg-bg"><Empty icon={<ISearch size={26} />} title="暂无视频" /></div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"><div className="w-9 h-9 spinner" /></div>
      )}
    </div>
  );
}
