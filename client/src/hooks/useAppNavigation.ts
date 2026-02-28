import { useLocation } from "wouter";

type GoToOptions = {
  replace?: boolean;
};

export function useAppNavigation() {
  const [, setLocation] = useLocation();

  const goTo = (path: string, options?: GoToOptions) => {
    if (options?.replace && typeof window !== "undefined") {
      window.history.replaceState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    setLocation(path);
  };

  const goBack = (fallbackPath = "/") => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation(fallbackPath);
  };

  const goHome = () => setLocation("/");

  return {
    goTo,
    goBack,
    goHome,
    navigate: goTo,
  };
}
