import { RealtimeManager } from "../features/realtime/manager/RealtimeManager.js";
import { SocketService } from "../features/realtime/socket/SocketService.js";

export function createCollaborationService({ url, boardId, user }) {
  const socketService = new SocketService({
    url,
    auth: { userId: user.id },
  });

  return new RealtimeManager({
    socketService,
    boardId,
    user,
  });
}
