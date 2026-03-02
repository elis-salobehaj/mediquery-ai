import { StateGraph, END, START } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { GraphState } from '@/ai/state';
import { routerNode, RouterDeps } from '@/ai/router';
import { schemaNavigatorNode, NavigatorDeps } from '@/ai/schema-navigator';
import { sqlWriterNode, SQLWriterDeps } from '@/ai/sql-writer';
import { criticNode, CriticDeps } from '@/ai/critic';
import { metaAgentNode, MetaAgentDeps } from '@/ai/meta-agent';
import { reflectorNode, ReflectorDeps } from '@/ai/reflector';
import { policyGateNode } from '@/ai/policy-gate';
import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from '@/ai/llm.service';
import { TokenUsageService } from '@/token-usage/token-usage.service';
import { DatabaseService } from '@/database/database.service';
import { ConfigService } from '@/config/config.service';
import { PromptService } from '@/ai/prompt.service';

const logger = new Logger('WorkflowGraph');

export type WorkflowDeps = RouterDeps &
  NavigatorDeps &
  SQLWriterDeps &
  CriticDeps &
  MetaAgentDeps &
  ReflectorDeps;

@Injectable()
export class GraphBuilder {
  constructor(
    private readonly llmService: LLMService,
    private readonly tokenUsageService: TokenUsageService,
    private readonly dbService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly promptService: PromptService,
  ) {}

  public build() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const workflow = new StateGraph<GraphState>({
      channels: {
        original_query: {
          value: (x: string, y: string) => y,
        },
        messages: {
          value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => [],
        },
        routing_decision: {
          value: (x: string, y: string) => y,
        },
        selected_tables: {
          value: (x: string[], y: string[]) => y,
        },
        table_schemas: {
          value: (x: Record<string, string>, y: Record<string, string>) => ({
            ...x,
            ...y,
          }),
        },
        navigator_contract: {
          value: (
            _x: GraphState['navigator_contract'],
            y: GraphState['navigator_contract'],
          ) => y,
        },
        generated_sql: {
          value: (x: string, y: string) => y,
        },
        validation_result: {
          value: (
            _x: GraphState['validation_result'],
            y: GraphState['validation_result'],
          ) => y,
        },
        reflections: {
          value: (x: string[], y: string[]) => x.concat(y),
          default: () => [],
        },
        reflector_contract: {
          value: (
            _x: GraphState['reflector_contract'],
            y: GraphState['reflector_contract'],
          ) => y,
        },
        previous_sqls: {
          value: (x: string[], y: string[]) => x.concat(y),
          default: () => [],
        },
        attempt_count: {
          value: (x: number, y: number) => y,
          default: () => 0,
        },
        max_attempts: {
          value: (x: number, y: number) => y,
          default: () => 3,
        },
        start_time: {
          value: (x: number, y: number) => y,
        },
        timeout_seconds: {
          value: (x: number, y: number) => y,
          default: () => 120,
        },
        user_id: {
          value: (x: string, y: string) => y,
        },
        request_id: {
          value: (_x: string, y: string) => y,
        },
        thoughts: {
          value: (x: string[], y: string[]) => x.concat(y),
          default: () => [],
        },
        selected_provider: {
          value: (_x: string, y: string) => y,
        },
        selected_model_override: {
          value: (_x: string, y: string) => y,
        },
        scoped_memory: {
          value: (
            _x: GraphState['scoped_memory'],
            y: GraphState['scoped_memory'],
          ) => y,
        },
        fast_mode: {
          value: (_x: boolean, y: boolean) => y,
          default: () => false,
        },
      },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    /**
     * LangGraph's TypeScript generics track node names through chained calls.
     * When using the imperative (non-chained) API, we cast to a simpler interface
     * to avoid needing `as any` on every addNode/addEdge call.
     */
    type ImperativeGraph = {
      addNode: (name: string, fn: (state: GraphState) => unknown) => void;
      addEdge: (from: string, to: string) => void;
      addConditionalEdges: (
        from: string,
        router: (state: GraphState) => string,
      ) => void;
      compile: typeof workflow.compile;
    };
    const w = workflow as unknown as ImperativeGraph;

    const deps: WorkflowDeps = {
      llmService: this.llmService,
      tokenUsageService: this.tokenUsageService,
      dbService: this.dbService,
      config: this.configService,
      promptService: this.promptService,
    };

    // Add nodes
    w.addNode('router', (state: GraphState) =>
      routerNode(state, deps, {
        provider: state.selected_provider,
        model: state.selected_model_override,
      }),
    );
    w.addNode('meta_agent', (state: GraphState) =>
      metaAgentNode(state, deps, {
        provider: state.selected_provider,
        model: state.selected_model_override,
      }),
    );
    w.addNode('schema_navigator', (state: GraphState) =>
      schemaNavigatorNode(state, deps, {
        provider: state.selected_provider,
        model: state.selected_model_override,
      }),
    );
    w.addNode('policy_gate', (state: GraphState) => policyGateNode(state));
    w.addNode('sql_writer', (state: GraphState) =>
      sqlWriterNode(state, deps, {
        provider: state.selected_provider,
        model: state.selected_model_override,
      }),
    );
    w.addNode('critic', (state: GraphState) =>
      criticNode(state, deps, {
        provider: state.selected_provider,
        model: state.selected_model_override,
      }),
    );
    w.addNode('reflector', (state: GraphState) =>
      reflectorNode(state, deps, {
        provider: state.selected_provider,
        model: state.selected_model_override,
      }),
    );

    // Entry point
    w.addEdge(START, 'router');

    // Conditional edges from router
    w.addConditionalEdges('router', (state: GraphState) => {
      const decision = state.routing_decision || 'DATA';
      logger.log(
        `[ROUTING] request_id=${state.request_id || 'n/a'} router_decision=${decision}`,
      );
      if (decision === 'DOMAIN_KNOWLEDGE') return 'meta_agent';
      if (decision === 'OFF_TOPIC') return END;
      return 'policy_gate';
    });

    // Linear flows
    w.addEdge('meta_agent', END);
    w.addConditionalEdges('policy_gate', (state: GraphState) => {
      if (state.validation_result?.error === 'UNSUPPORTED_INTENT') {
        logger.log(
          `[POLICY_GATE] request_id=${state.request_id || 'n/a'} blocked unsupported intent`,
        );
        return END;
      }
      return 'schema_navigator';
    });
    w.addEdge('schema_navigator', 'sql_writer');
    w.addEdge('sql_writer', 'critic');

    // Conditional edges from critic (Reflection Loop)
    w.addConditionalEdges('critic', (state: GraphState) => {
      // Check timeout
      if (Date.now() / 1000 - state.start_time > state.timeout_seconds) {
        logger.warn('[SHOULD_CONTINUE] Workflow timeout exceeded');
        return END;
      }

      // Check validation
      if (state.validation_result?.valid) {
        logger.log(
          `[SHOULD_CONTINUE] request_id=${state.request_id || 'n/a'} SQL validation successful`,
        );
        return END;
      }

      if (state.validation_result?.error === 'UNSUPPORTED_INTENT') {
        logger.log(
          `[SHOULD_CONTINUE] request_id=${state.request_id || 'n/a'} unsupported intent detected, stopping`,
        );
        return END;
      }

      // Check max attempts
      if (state.attempt_count >= state.max_attempts) {
        logger.warn(
          `[SHOULD_CONTINUE] Max attempts (${state.max_attempts}) reached - ending`,
        );
        return END;
      }

      logger.log(
        `[SHOULD_CONTINUE] request_id=${
          state.request_id || 'n/a'
        } retrying SQL generation (attempt ${
          state.attempt_count + 1
        }/${state.max_attempts})`,
      );
      return 'reflector';
    });

    // Reflector loops back to sql_writer
    w.addEdge('reflector', 'sql_writer');

    return workflow.compile();
  }
}
