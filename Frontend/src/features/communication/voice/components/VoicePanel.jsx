// @ts-check

import { useState } from "react";
import VoiceControls from "./VoiceControls.jsx";
import VoiceParticipantList from "./VoiceParticipantList.jsx";
import { useThemeContext } from "../../../theme/ThemeProvider.jsx";

export default function VoicePanel(props) {
  const [collapsed, setCollapsed] = useState(false);
  const { isDark } = useThemeContext();
  const participantCount = props.participants?.length ?? 0;
  const connectionLabel =
    props.connectionState === "connected" ? "Connected" : "Disconnected";

  const panelClasses = isDark
    ? "border-slate-700 bg-slate-900 text-white shadow-none"
    : "border-slate-200 bg-white text-black shadow-xl shadow-slate-200/40";

  const badgeClasses = isDark ? "bg-slate-800 text-white" : "bg-white text-black";

  const buttonClasses = isDark
    ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
    : "border-slate-200 bg-white text-black hover:bg-slate-50";

  return (
    <div
      className={`voice-panel w-full max-w-sm rounded-3xl border p-4 transition ${panelClasses}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.2em] ${
              isDark ? "text-slate-400" : "text-black"
            }`}
          >
            Voice chat
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}>
              {connectionLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClasses}`}
            >
              {participantCount} online
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className={`inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition ${buttonClasses}`}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {collapsed ? null : (
        <div className="space-y-4">
          <VoiceControls {...props} />
          <VoiceParticipantList participants={props.participants} />
        </div>
      )}
    </div>
  );
}