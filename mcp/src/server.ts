#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerPrompts } from './prompts.js'
import { registerResources } from './resources.js'
import { registerTools } from './tools.js'

const server = new McpServer({
  name: 'supplyguard-kg',
  version: '0.2.0',
})

registerTools(server)
registerResources(server)
registerPrompts(server)

const transport = new StdioServerTransport()
await server.connect(transport)
