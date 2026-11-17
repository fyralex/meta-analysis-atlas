import { Component, type ReactNode } from "react";

interface Props {
  /** Called once if the 3D view fails: its code didn't load, or the browser couldn't draw it. */
  onError: () => void;
  children: ReactNode;
}

/** Keeps a failure of the 3D view inside it, so the page can fall back to the 2D view instead of going blank. */
export class View3DBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
