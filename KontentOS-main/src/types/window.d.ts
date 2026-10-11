declare global {
  interface Window {
    KontentOS?: {
      openScheduleModal?: (initialData?: any) => void;
      setTab?: (tab: string) => void;
    };
  }
}

export {};
