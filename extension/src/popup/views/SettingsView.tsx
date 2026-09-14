import React, { useState } from 'react';
import { Terminal, Save, Check, RefreshCw, FileText } from 'lucide-react';
import { UserSettings, NativeHelperStatus } from '../../shared/types';

interface SettingsViewProps {
  settings: UserSettings;
  onSaveSettings: (settings: UserSettings) => void;
  helperStatus: NativeHelperStatus;
  onCheckHelper: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  helperStatus,
  onCheckHelper,
}) => {
  const [form, setForm] = useState<UserSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const handleSave = () => {
    onSaveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyDiagnostics = () => {
    const report = {
      timestamp: new Date().toISOString(),
      extensionVersion: '1.0.0',
      userAgent: navigator.userAgent,
      settings: form,
      helperStatus,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopiedDiag(true);
    setTimeout(() => setCopiedDiag(false), 2000);
  };

  return (
    <div className="p-4 space-y-4 text-xs text-slate-300">
      {/* File Naming & Folder */}
      <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md">
        <h4 className="font-semibold text-slate-200">Download Organization</h4>

        <div className="space-y-1">
          <label className="block text-slate-400">Filename Template</label>
          <input
            type="text"
            value={form.namingTemplate}
            onChange={(e) => setForm({ ...form, namingTemplate: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
          />
          <p className="text-[10px] text-slate-500">
            Available: {'{title}'}, {'{resolution}'}, {'{ext}'}, {'{date}'}
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-slate-400">Subfolder</label>
          <input
            type="text"
            value={form.downloadSubfolder}
            onChange={(e) => setForm({ ...form, downloadSubfolder: e.target.value })}
            placeholder="e.g. Namaw"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saved ? 'Saved!' : 'Save Preferences'}</span>
        </button>
      </div>

      {/* Native Companion Status */}
      <div className="space-y-2.5 bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h4 className="font-semibold text-slate-200">Native Companion (yt-dlp)</h4>
          </div>
          <button
            onClick={onCheckHelper}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
            title="Check connection"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-[11px] space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                helperStatus.connected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>Status: {helperStatus.connected ? 'Connected' : 'Not Connected'}</span>
          </div>

          {helperStatus.connected ? (
            <div className="text-slate-400 font-mono space-y-0.5 pl-4">
              <div>Helper version: {helperStatus.version || '1.0.0'}</div>
              <div>yt-dlp version: {helperStatus.ytdlpVersion || 'Installed'}</div>
              <div>FFmpeg available: {helperStatus.ffmpegAvailable ? 'Yes' : 'No'}</div>
            </div>
          ) : (
            <p className="text-slate-500 text-[10px] pl-4">
              Install the optional helper from the repository to enable YouTube, Instagram, and native FFmpeg stream merging.
            </p>
          )}
        </div>
      </div>

      {/* Diagnostics */}
      <div className="pt-1">
        <button
          onClick={copyDiagnostics}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-xs"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{copiedDiag ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}</span>
        </button>
      </div>
    </div>
  );
};
