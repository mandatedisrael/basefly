import { IAgentRuntime, Memory, ActionExample, Action } from '@elizaos/core';

declare module '@elizaos/core' {
  interface IAgentRuntime {
    databaseAdapter: {
      createMemory: (memory: any, type: string, persist: boolean) => Promise<any>;
    };
    getMemoryManager: (type: string) => any;
    messageManager: any;
    composeState: (memory: Memory) => Promise<any>;
    updateRecentMessageState: (state: any) => Promise<any>;
  }

  interface Memory {
    userId?: string;
  }

  interface ActionExample {
    user?: string;
    name?: string;
    content: {
      text: string;
    };
  }

  interface Action {
    suppressInitialMessage?: boolean;
  }
} 