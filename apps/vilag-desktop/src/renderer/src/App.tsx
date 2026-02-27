import { HashRouter, Routes, Route } from 'react-router-dom';

import { MainLayout } from '@renderer/layouts/MainLayout';
import HomePage from '@renderer/pages/home';
import LocalPage from '@renderer/pages/local';
import SettingsPage from '@renderer/pages/settings';
import WidgetPage from '@renderer/pages/widget';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/local" element={<LocalPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/widget" element={<WidgetPage />} />
      </Routes>
    </HashRouter>
  );
}

