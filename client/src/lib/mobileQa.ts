const MOBILE_QA_STORAGE_KEY = "mobile_qa_enabled";
const ROOT_CLASS = "mobile-qa-enabled";
const OVERFLOW_CLASS = "qa-overflow-x";

function getDocumentRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.documentElement;
}

export function getMobileQaEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MOBILE_QA_STORAGE_KEY) === "1";
}

export function setMobileQaEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_QA_STORAGE_KEY, enabled ? "1" : "0");
}

export function applyMobileQaState(enabled: boolean): void {
  const root = getDocumentRoot();
  if (!root) return;
  root.classList.toggle(ROOT_CLASS, enabled);
}

export function markOverflowInSheets(): number {
  if (typeof document === "undefined") return 0;

  const scope = document.querySelector(".sheet-layout");
  const previouslyMarked = document.querySelectorAll(`.${OVERFLOW_CLASS}`);
  previouslyMarked.forEach((node) => node.classList.remove(OVERFLOW_CLASS));
  if (!scope) return 0;

  const candidates = scope.querySelectorAll<HTMLElement>("*");
  let markedCount = 0;
  candidates.forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 1) {
      el.classList.add(OVERFLOW_CLASS);
      markedCount += 1;
    }
  });
  return markedCount;
}

export function startMobileQaWatcher(onUpdate?: (count: number) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  let rafId = 0;
  const run = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(() => {
      const count = markOverflowInSheets() ?? 0;
      onUpdate?.(count);
    });
  };

  run();
  window.addEventListener("resize", run);
  const timer = window.setInterval(run, 1500);

  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    window.removeEventListener("resize", run);
    window.clearInterval(timer);
  };
}
