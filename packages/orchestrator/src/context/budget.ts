/**
 * Token estimation without a tokenizer. Four characters per token is a fair average for English
 * and code on the models we target, and the receipt records that it is an estimate.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
