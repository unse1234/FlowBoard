class OperationStore {
  #operationsByBoard = new Map();

  add(operation) {
    const operations = this.#getBoardOperations(operation.boardId);

    if (operations.has(operation.operationId)) {
      return { stored: false, duplicate: true };
    }

    operations.set(operation.operationId, operation);

    return { stored: true, duplicate: false };
  }

  list(boardId) {
    return Array.from(this.#getBoardOperations(boardId).values());
  }

  #getBoardOperations(boardId) {
    if (!this.#operationsByBoard.has(boardId)) {
      this.#operationsByBoard.set(boardId, new Map());
    }

    return this.#operationsByBoard.get(boardId);
  }
}

module.exports = {
  OperationStore,
};
