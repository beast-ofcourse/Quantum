import { Disposable, disposableFrom } from "../types";
import { extensionViewRegistry } from "../viewRegistry";

export interface ViewRegistration {
  id: string;
  extensionId: string;
  title: string;
  icon?: string;
  render: () => HTMLElement;
  onDispose?: () => void;
}

type Listener = (views: Map<string, ViewRegistration>) => void;

export function createViewsAPI(extensionId: string) {
  const registrations = new Map<string, ViewRegistration>();
  const listeners = new Set<Listener>();

  function notify() {
    listeners.forEach((l) => l(registrations));
  }

  return {
    register(id: string, opts: {
      title: string;
      icon?: string;
      render: () => HTMLElement;
      onDispose?: () => void;
    }): Disposable {
      const viewId = `${extensionId}:${id}`;
      const reg: ViewRegistration = {
        id: viewId,
        extensionId,
        title: opts.title,
        icon: opts.icon,
        render: opts.render,
        onDispose: opts.onDispose,
      };
      registrations.set(viewId, reg);
      notify();

      // Also register with the global UI registry so Sidebar/ActivityBar can discover it
      const globalDisposable = extensionViewRegistry.register({
        id: viewId,
        extensionId,
        title: opts.title,
        icon: opts.icon,
        render: opts.render,
        onDispose: opts.onDispose,
      });

      return disposableFrom(() => {
        reg.onDispose?.();
        registrations.delete(viewId);
        globalDisposable.dispose();
        notify();
      });
    },

    onChanged(cb: Listener): Disposable {
      listeners.add(cb);
      cb(registrations);
      return disposableFrom(() => listeners.delete(cb));
    },

    getAll(): Map<string, ViewRegistration> {
      return registrations;
    },
  };
}

export type ViewsAPI = ReturnType<typeof createViewsAPI>;
