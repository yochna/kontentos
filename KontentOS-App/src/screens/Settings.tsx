import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, PageHeader, PageShell, StatusPill } from '@/components/ui';
import { settingsSections } from '@/data/mock';
import { useTheme } from '@/lib/theme';
import { useStore, useDisplayProfile } from '@/lib/store';
import { api } from '@/lib/api';
import { MODEL_CHOICES, readAiSettings, saveAiSettings } from '@/lib/prefs';

export default function Settings() {
  const [section, setSection] = useState('account');
  const { theme, setTheme } = useTheme();
  const { user, dbStatus, online, saveUser, scheduled, videos } = useStore();
  const displayProfile = useDisplayProfile();

  // Profile states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [igHandle, setIgHandle] = useState('');
  const [ytHandle, setYtHandle] = useState('');
  // Both start empty and are filled from the account below. Seeding them with sample text meant the
  // first profile save — for any reason — wrote that sample over the creator's real niche and locale.
  const [niche, setNiche] = useState('');
  const [locale, setLocale] = useState('');
  const [profileSaved, setProfileSaved] = useState<boolean | null>(null);

  // AI settings — hydrated from what the engines actually read, so a reload shows the saved truth.
  const [savedAi] = useState(readAiSettings);
  const [aiModel, setAiModel] = useState(savedAi.aiModel);
  const [temperature, setTemperature] = useState(savedAi.temperature);
  const [autoDraft, setAutoDraft] = useState(savedAi.autoDraft);
  const [voiceMatch, setVoiceMatch] = useState(savedAi.voiceMatch);
  const [transcribeOnIngest, setTranscribeOnIngest] = useState(savedAi.transcribeOnIngest);
  const [aiSaved, setAiSaved] = useState<boolean | null>(null);

  // API Keys state
  const [geminiKey, setGeminiKey] = useState('Checking...');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [keyEditable, setKeyEditable] = useState(true);
  const [newKeyInput, setNewKeyInput] = useState('');
  // The one box under the key field carries both outcomes, so it remembers which one it holds.
  const [keyNotice, setKeyNotice] = useState<{ text: string; ok: boolean } | null>(null);

  // Export settings
  const [exportRes, setExportRes] = useState('1080x1920');
  const [exportFps, setExportFps] = useState('30');
  const [exportCodec, setExportCodec] = useState('h264');
  const [burnCaptions, setBurnCaptions] = useState(true);

  // Account security
  const [currentPw, setCurrentPw] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name ?? '');
    setEmail(user?.email ?? '');
    setIgHandle(user?.instagram_username ?? '');
    setYtHandle(user?.youtube_channel_id ?? '');
    setNiche(user?.niche ?? '');
    setLocale(user?.locale ?? '');
  }, [user]);

  useEffect(() => {
    // An older build mirrored the engine key into this browser. It has no use here any more —
    // the server reads only its own environment — so a key left behind is deleted, not shown.
    try {
      if (localStorage.getItem('kontentos_gemini_api_key')) localStorage.removeItem('kontentos_gemini_api_key');
    } catch {}
    api
      .getAiStatus()
      .then((st) => {
        setGeminiKey(st?.keyMasked || 'Not set yet');
        setKeyEditable(st?.editable !== false);
      })
      .catch(() => setGeminiKey('Not set yet'));
  }, []);

  const initials = (fullName || 'A').trim().charAt(0).toUpperCase();

  async function handleSaveProfile() {
    setProfileSaved(null);
    // Email is the sign-in address and lives only on the account row, so it is not sent here.
    const ok = await saveUser({
      full_name: fullName,
      instagram_username: igHandle.replace(/^@/, ''),
      youtube_channel_id: ytHandle,
      niche,
      locale,
    });
    setProfileSaved(ok);
    setTimeout(() => setProfileSaved(null), 3500);
  }

  // The server revokes this session when the password changes, so the studio goes back to the
  // sign-in screen and the creator starts again with the new password.
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwNotice(null);
    try {
      await api.changePassword(currentPw, nextPw);
      window.dispatchEvent(new Event('kt:signedOut'));
    } catch (err: any) {
      setPwNotice(err?.message || 'Could not change the password.');
      setPwBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await api.signOut();
    } catch {
      // Even if the call fails, the browser drops the cookie below.
    }
    window.dispatchEvent(new Event('kt:signedOut'));
  }

  function handleSaveAi() {
    saveAiSettings({ aiModel, temperature, autoDraft, voiceMatch, transcribeOnIngest });
    setAiSaved(true);
    setTimeout(() => setAiSaved(null), 3000);
  }

  async function handleSaveApiKey() {
    const clean = newKeyInput.trim();
    if (!clean) return;
    try {
      // Sent once, to the server that will use it. Nothing about a key is kept in this browser.
      const res = await api.saveGeminiApiKey(clean);
      setGeminiKey(res.keyMasked || '••••••••••••••••');
      setIsEditingKey(false);
      setNewKeyInput('');
      setKeyNotice({ text: 'Gemini key active for this workspace.', ok: true });
      setTimeout(() => setKeyNotice(null), 4000);
    } catch (err: any) {
      setKeyNotice({ text: err?.message || 'Failed to save API key', ok: false });
    }
  }

  function handleExportWorkspaceBackup() {
    const backupData = {
      workspace: 'KontentOS Standalone',
      timestamp: new Date().toISOString(),
      user: { fullName, email, igHandle, ytHandle, niche, locale },
      aiSettings: { aiModel, temperature, autoDraft, voiceMatch },
      exportSettings: { exportRes, exportFps, exportCodec, burnCaptions },
      scheduledCount: scheduled.length,
      videoVaultCount: videos.length,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KontentOS_Workspace_Backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell className="animate-fade-in">
      <PageHeader
        eyebrow="Room"
        icon="settings"
        title="Account & the room"
        description="Creator profile, your YouTube handle, generation temperature and this session."
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Section Navigation Rail */}
        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible bg-surface p-2 rounded-card border border-line shadow-xs">
          {settingsSections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`shrink-0 text-left flex items-center gap-3 rounded-btn px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors kt-focus ${
                section === s.id
                  ? 'bg-primary-soft text-primary shadow-xs'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              <Icon name={s.icon} size={18} />
              <span>{s.title}</span>
            </button>
          ))}
        </nav>

        {/* Dynamic Panels */}
        <div className="space-y-6 min-w-0">
          {/* 1. Account & Profile */}
          {section === 'account' && (
            <>
              <Card className="p-6 shadow-xs border-line space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-[22px] font-bold text-ink">
                      Creator Identity &amp; Profile
                    </h2>
                    <p className="text-[12.5px] text-ink-muted">
                      Your public handles for syndicated publishing and watermark attribution.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-card bg-surface-2/60 border border-line">
                  <span
                    className="grid place-items-center w-16 h-16 rounded-full text-on-primary font-display text-[26px] font-bold shadow-xs shrink-0"
                    style={{ background: 'var(--primary)' }}
                  >
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-ink truncate">
                      {fullName || displayProfile.name}
                    </div>
                    <div className="text-[12.5px] text-ink-muted mt-0.5 flex items-center gap-2">
                      <span>{email}</span>
                      <span>•</span>
                      <span className="text-primary font-medium">@{igHandle || 'yourhandle'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      Display Name
                    </label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      Email Address
                    </label>
                    <input
                      value={email}
                      readOnly
                      title="Your sign-in address. It cannot be edited from the studio."
                      className="w-full rounded-btn border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-ink-muted outline-none cursor-default"
                    />
                    <p className="mt-1 text-[11px] text-ink-dim">Used to sign in · cannot be changed here.</p>
                  </div>

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      Instagram Handle
                    </label>
                    <div className="flex items-center rounded-btn border border-line bg-surface overflow-hidden">
                      <span className="px-3 text-[13px] text-ink-dim bg-surface-2 border-r border-line">
                        @
                      </span>
                      <input
                        value={igHandle}
                        onChange={(e) => setIgHandle(e.target.value)}
                        className="w-full px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      YouTube Channel Identifier
                    </label>
                    <input
                      value={ytHandle}
                      onChange={(e) => setYtHandle(e.target.value)}
                      placeholder="@ChannelHandle"
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      Primary Content Niche
                    </label>
                    <input
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      placeholder="Not set yet"
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary placeholder:text-ink-dim"
                    />
                  </div>

                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      Target Audience Locale
                    </label>
                    <input
                      value={locale}
                      onChange={(e) => setLocale(e.target.value)}
                      placeholder="Not set yet"
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary placeholder:text-ink-dim"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-line">
                  <div>
                    {profileSaved && (
                      <span className="text-[12.5px] text-success font-semibold flex items-center gap-1.5 animate-fade-in">
                        <Icon name="check_circle" size={16} /> Profile changes saved to database.
                      </span>
                    )}
                    {profileSaved === false && (
                      <span className="text-[12.5px] text-danger font-semibold flex items-center gap-1.5 animate-fade-in">
                        <Icon name="error_outline" size={16} /> Could not save — nothing changed.
                      </span>
                    )}
                  </div>
                  <Button icon="check" onClick={handleSaveProfile}>
                    Save Profile Changes
                  </Button>
                </div>
              </Card>

              {/* Backend & Data Persistence Status */}
              <Card className="p-6 shadow-xs border-line">
                <h3 className="font-display text-[18px] font-bold text-ink mb-1">
                  Database &amp; Engine Status
                </h3>
                <p className="text-[12.5px] text-ink-muted mb-4">
                  One server, one account: everything below describes the storage your workspace
                  is actually writing to right now.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="rounded-card border border-line p-3.5 bg-surface">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                      Server Connection
                    </div>
                    <div
                      className={`text-[14px] font-bold mt-1 flex items-center gap-1.5 ${
                        online ? 'text-success' : 'text-danger'
                      }`}
                    >
                      <Icon name={online ? 'cloud_done' : 'cloud_off'} size={17} />
                      {online ? 'Connected' : 'Server unreachable'}
                    </div>
                  </div>
                  <div className="rounded-card border border-line p-3.5 bg-surface">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                      Storage Engine
                    </div>
                    <div className="text-[14px] font-bold text-ink mt-1">
                      {dbStatus?.provider === 'mongodb' ? 'MongoDB' : 'Local Persistent JSON'}
                    </div>
                  </div>
                  <div className="rounded-card border border-line p-3.5 bg-surface">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                      Clips in Media Vault
                    </div>
                    <div className="text-[14px] font-bold text-primary mt-1">
                      {videos.length} Asset(s)
                    </div>
                  </div>
                </div>
              </Card>

              {/* Account security: the studio is one creator's workspace, so sign-out is real */}
              <Card className="p-6 shadow-xs border-line space-y-5">
                <div>
                  <h3 className="font-display text-[18px] font-bold text-ink mb-1">
                    Sign-in &amp; Password
                  </h3>
                  <p className="text-[12.5px] text-ink-muted">
                    Signed in as <span className="font-semibold text-ink">{email || 'your account'}</span>.
                    Your clips, captions and calendar are visible only to this account.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      Current password
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                      New password
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={nextPw}
                      onChange={(e) => setNextPw(e.target.value)}
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                    />
                  </div>
                  {pwNotice && (
                    <p className="sm:col-span-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-danger">
                      <Icon name="error_outline" size={15} /> {pwNotice}
                    </p>
                  )}
                  <div className="sm:col-span-2 flex items-center justify-between gap-3">
                    <p className="text-[11.5px] text-ink-dim">
                      Changing it signs you out of this browser. Minimum 8 characters.
                    </p>
                    <Button
                      type="submit"
                      variant="secondary"
                      icon="vpn_key"
                      disabled={!currentPw || nextPw.length < 8 || pwBusy}
                    >
                      {pwBusy ? 'Updating…' : 'Change password'}
                    </Button>
                  </div>
                </form>

                <div className="flex items-center justify-between pt-4 border-t border-line">
                  <p className="text-[11.5px] text-ink-dim">Ends this session on this browser.</p>
                  <Button variant="secondary" icon="logout" onClick={handleSignOut}>
                    Sign out
                  </Button>
                </div>
              </Card>
            </>
          )}

          {/* 2. AI Engine */}
          {section === 'ai' && (
            <Card className="p-6 shadow-xs border-line space-y-6">
              <div>
                <h2 className="font-display text-[22px] font-bold text-ink">
                  Generation engine
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  How inventive the copywriter is allowed to be, which voice it writes in, and which automations are on.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="ai-primary-model" className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                    Primary model
                  </label>
                  <select
                    id="ai-primary-model"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                  >
                    {MODEL_CHOICES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11.5px] text-ink-dim mt-1">
                    Sent to the copy engines as their first choice; if it is unavailable the server
                    runs the next engine in the list.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">
                      Creativity / Temperature ({temperature})
                    </label>
                    <span className="text-[11.5px] font-bold text-primary">
                      {temperature <= 0.3
                        ? 'Precise & Direct'
                        : temperature <= 0.7
                        ? 'Balanced Creator'
                        : 'Wild & Contrarian'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-line">
                <div>
                  <h3 className="font-semibold text-[14px] text-ink">Automation preferences</h3>
                  <p className="text-[12px] text-ink-dim mt-0.5">
                    The voice, the engine and the creativity slider are live. The other two are
                    saved but no engine reads them yet.
                  </p>
                </div>
                <ToggleRow
                  label="Auto-draft script blueprints"
                  desc="Draft 3-beat script timings and visual hooks for every spark idea. Not wired yet."
                  checked={autoDraft}
                  onChange={setAutoDraft}
                />
                <ToggleRow
                  label="Voice-match platform copywriting"
                  desc="Write Instagram, YouTube and LinkedIn captions against your Brand Kit voice."
                  checked={voiceMatch}
                  onChange={setVoiceMatch}
                />
                <ToggleRow
                  label="Transcribe on intake"
                  desc="Run speech-to-text as soon as raw video lands on the bench. Not wired yet."
                  checked={transcribeOnIngest}
                  onChange={setTranscribeOnIngest}
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-line">
                <div>
                  {aiSaved && (
                    <span className="text-[12.5px] text-success font-semibold flex items-center gap-1.5 animate-fade-in">
                      <Icon name="check_circle" size={16} /> AI configuration saved.
                    </span>
                  )}
                </div>
                <Button icon="check" onClick={handleSaveAi}>
                  Save AI Preferences
                </Button>
              </div>
            </Card>
          )}

          {/* 3. Appearance */}
          {section === 'appearance' && (
            <Card className="p-6 shadow-xs border-line space-y-6">
              <div>
                <h2 className="font-display text-[22px] font-bold text-ink">
                  Aesthetic &amp; Theme Studio
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  Light Paper Editorial is the primary aesthetic. Evergreen dark provides low-light evening comfort.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <button
                  onClick={() => setTheme('light')}
                  className={`text-left rounded-card border-2 p-3.5 transition-all kt-focus ${
                    theme === 'light'
                      ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <div
                    className="h-20 rounded-btn mb-2.5 border border-line shadow-inner flex items-center justify-center font-display text-[18px] text-[#1E2522]"
                    style={{ background: '#FAF9F5' }}
                  >
                    Paper Editorial
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-ink">Light (Default)</span>
                    {theme === 'light' && (
                      <Icon name="check_circle" size={18} className="text-primary" />
                    )}
                  </div>
                </button>

                <button
                  onClick={() => setTheme('dark')}
                  className={`text-left rounded-card border-2 p-3.5 transition-all kt-focus ${
                    theme === 'dark'
                      ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <div
                    className="h-20 rounded-btn mb-2.5 border border-line shadow-inner flex items-center justify-center font-display text-[18px] text-[#FAF9F5]"
                    style={{ background: '#14171A' }}
                  >
                    Evergreen Dark
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-ink">Evergreen Dark</span>
                    {theme === 'dark' && (
                      <Icon name="check_circle" size={18} className="text-primary" />
                    )}
                  </div>
                </button>
              </div>
            </Card>
          )}

          {/* 4. API Keys */}
          {section === 'keys' && (
            <Card className="p-6 shadow-xs border-line space-y-6">
              <div>
                <h2 className="font-display text-[22px] font-bold text-ink">
                  Engine key
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  The model key lives on the server that runs this workspace, so the studio can keep
                  writing while you are away from this device. This browser keeps no copy of it, and
                  nothing you paste here is ever sent to a third party except Google.
                </p>
              </div>

              {keyNotice && (
                <div
                  className={`p-3 border rounded-btn text-[13px] flex items-center gap-2 ${
                    keyNotice.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'
                      : 'bg-danger/10 text-danger border-danger/30'
                  }`}
                >
                  <Icon name={keyNotice.ok ? 'check_circle' : 'error_outline'} size={16} className={keyNotice.ok ? 'text-emerald-600' : 'shrink-0'} />
                  {keyNotice.text}
                </div>
              )}

              <div className="space-y-3.5">
                <div className="flex items-center justify-between p-3.5 rounded-card border border-line bg-surface">
                  <div className="flex items-center gap-3">
                    <Icon name="auto_awesome" size={20} className="text-tertiary" />
                    <div>
                      <div className="text-[13.5px] font-bold text-ink">Google Gemini API Key</div>
                      <div className="text-[12px] text-ink-dim font-mono">{geminiKey}</div>
                    </div>
                  </div>
                  {keyEditable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setIsEditingKey(!isEditingKey)}
                    >
                      {isEditingKey ? 'Cancel' : 'Rotate Key'}
                    </Button>
                  ) : (
                    // The endpoint refuses this in production, so the field is not offered rather than
                    // shown and then answered with a 403.
                    <span className="text-[11.5px] text-ink-dim text-right max-w-[28ch]">
                      Held by the host · set GEMINI_API_KEY in its environment
                    </span>
                  )}
                </div>

                {isEditingKey && (
                  <div className="p-4 rounded-card border border-primary/40 bg-primary-soft/30 space-y-3">
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block">
                      Enter new Google Gemini API Key
                    </label>
                    <input
                      type="password"
                      value={newKeyInput}
                      onChange={(e) => setNewKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingKey(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" icon="check" onClick={handleSaveApiKey}>
                        Update Secret
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-3.5 rounded-card border border-line bg-surface">
                  <div className="flex items-center gap-3">
                    <Icon name="database" size={20} className="text-primary" />
                    <div>
                      <div className="text-[13.5px] font-bold text-ink">Database</div>
                      <div className="text-[12px] text-ink-dim font-mono">
                        {dbStatus?.provider === 'mongodb'
                          ? 'MongoDB (MONGODB_URI)'
                          : 'Local JSON file — cleared on redeploy'}
                      </div>
                    </div>
                  </div>
                  <StatusPill
                    tone={
                      dbStatus?.provider === 'mongodb'
                        ? dbStatus?.connected
                          ? 'primary'
                          : 'danger'
                        : 'neutral'
                    }
                  >
                    {dbStatus?.provider === 'mongodb'
                      ? dbStatus?.connected
                        ? 'Connected'
                        : 'Unreachable'
                      : 'Not set'}
                  </StatusPill>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-card border border-line bg-surface">
                  <div className="flex items-center gap-3">
                    <Icon name="movie_filter" size={20} className="text-primary" />
                    <div>
                      <div className="text-[13.5px] font-bold text-ink">Uploaded clips</div>
                      <div className="text-[12px] text-ink-dim">
                        Stored in the server&apos;s uploads folder, not in the database.
                        {dbStatus?.provider === 'mongodb' &&
                          ' Records survive a redeploy; the files do not, unless the host has a disk.'}
                      </div>
                    </div>
                  </div>
                  <StatusPill tone="neutral">{videos.length} file(s)</StatusPill>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-card border border-line bg-surface">
                  <div className="flex items-center gap-3">
                    <Icon name="photo_camera" size={20} className="text-rose-500" />
                    <div>
                      <div className="text-[13.5px] font-bold text-ink">Instagram Graph API</div>
                      <div className="text-[12px] text-ink-dim">Manual Assist Mode (Default)</div>
                    </div>
                  </div>
                  <StatusPill tone="neutral">Ready</StatusPill>
                </div>
              </div>
            </Card>
          )}

          {/* 5. Exports */}
          {section === 'exports' && (
            <Card className="p-6 shadow-xs border-line space-y-6">
              <div>
                <h2 className="font-display text-[22px] font-bold text-ink">
                  Render &amp; Export Presets
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  Default hardware rendering parameters for FFmpeg WebAssembly exports.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                    Resolution
                  </label>
                  <select
                    value={exportRes}
                    onChange={(e) => setExportRes(e.target.value)}
                    className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                  >
                    <option value="1080x1920">1080 × 1920 (9:16 Reel)</option>
                    <option value="1080x1080">1080 × 1080 (1:1 Square)</option>
                    <option value="1920x1080">1920 × 1080 (16:9 Landscape)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                    Encoding Codec
                  </label>
                  <select
                    value={exportCodec}
                    onChange={(e) => setExportCodec(e.target.value)}
                    className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                  >
                    <option value="h264">H.264 (Maximum Compatibility)</option>
                    <option value="hevc">HEVC / H.265 (Ultra Compact)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                    Frame Rate
                  </label>
                  <select
                    value={exportFps}
                    onChange={(e) => setExportFps(e.target.value)}
                    className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                  >
                    <option value="30">30 FPS (Standard)</option>
                    <option value="60">60 FPS (Cinematic High Motion)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-line">
                <ToggleRow
                  label="Burn-in kinetic captions by default"
                  desc="Embeds stylized word-by-word subtitles directly into the rendered MP4 file."
                  checked={burnCaptions}
                  onChange={setBurnCaptions}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-line">
                <Button icon="download" variant="secondary" onClick={handleExportWorkspaceBackup}>
                  Export Workspace Backup (.json)
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-card border border-line bg-surface hover:border-line-strong transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{label}</div>
        <div className="text-[11.5px] text-ink-dim mt-0.5">{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors kt-focus shrink-0 ${
          checked ? 'bg-primary' : 'bg-surface-3'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
