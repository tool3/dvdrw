import { useAppStore } from './stores/appStore';
import { EditorView } from './views/EditorView';
import { CastView } from './views/CastView';

export const App = () => {
  const view = useAppStore((s) => s.view);
  return view === 'script' ? <EditorView /> : <CastView />;
};
