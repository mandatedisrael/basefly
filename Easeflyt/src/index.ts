import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import flightBookingPlugin from './plugin.ts';
import { character } from './character.ts';
import dotenv from 'dotenv';


dotenv.config();

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing character');
  logger.info('Name: ', character.name);
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [flightBookingPlugin],
};
const project: Project = {
  agents: [projectAgent],
};

export { testSuites } from './__tests__/e2e';
export { character } from './character.ts';

export default project;
