// @ts-check

import { useThemeContext } from "../../../theme/ThemeProvider.jsx";

// @ts-ignore
export default function VoiceParticipantList({ participants }) {
  const { isDark } = useThemeContext();

  const containerClasses = isDark
    ? "border-slate-700 bg-slate-900 text-white"
    : "border-gray-200 bg-white text-black shadow-sm";
  const itemClasses = isDark
    ? "border-slate-700 bg-slate-800 text-white"
    : "border-black/10 bg-white text-black";
  const nameClasses = isDark ? "text-slate-100" : "text-black";
  const subTextClasses = isDark ? "text-slate-400" : "text-slate-500";
  const emptyClasses = isDark
    ? "border-slate-700 bg-slate-800 text-slate-300"
    : "border-black/10 bg-white text-black";

  return (
    <div
      className={`voice-participants rounded-lg border p-3 transition ${containerClasses}`}
    >
      <p className="mb-3 text-sm font-semibold">Voice participants</p>
      <ul className="space-y-2">
        {participants?.length ? (
          // @ts-ignore
          participants.map((participant) => (
            <li
              key={participant.userId}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${itemClasses}`}
            >
              <div>
                <p className={`text-sm font-semibold ${nameClasses}`}>
                  {participant.username}
                  {participant.isLocal ? " (You)" : ""}
                </p>
                <p className={`text-xs ${subTextClasses}`}>
                  {participant.connectionState}
                </p>
              </div>
              <div
                className={`h-2.5 w-2.5 rounded-full ${participant.isSpeaking ? "bg-emerald-500" : "bg-slate-300"}`}
              ></div>
            </li>
          ))
        ) : (
          <li className={`rounded-md border px-3 py-2 text-sm ${emptyClasses}`}>
            No voice participants yet.
          </li>
        )}
      </ul>
    </div>
  );
}
