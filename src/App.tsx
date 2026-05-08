import { useAppStore } from './stores/appStore';
import { EditorView } from './views/EditorView';
import { CastView } from './views/CastView';
import { PresetGallery } from './components/presets/PresetGallery';

export const App = () => {
  const view = useAppStore((s) => s.view);
  return (
    <>
      {view === 'script' ? <EditorView /> : <CastView />}
      <PresetGallery />
    </>
  );
};
