import { VSCodeLMProvider } from './VSCodeLMProvider';
import type { LLMProvider } from './LLMProvider';

export class LLMProviderFactory {
  public createDefaultProvider(): LLMProvider {
    return new VSCodeLMProvider();
  }
}
