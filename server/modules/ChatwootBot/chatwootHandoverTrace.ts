/** Короткий ланцюжок кроків handover для журналу подій (UI). */
export class ChatwootHandoverTrace {
  private readonly steps: string[] = [];

  plan(fragment: string): void {
    this.steps.push(`plan:${fragment}`);
  }

  ok(fragment: string): void {
    this.steps.push(fragment);
  }

  skip(fragment: string): void {
    this.steps.push(`skip:${fragment}`);
  }

  toDetailsFragment(): string {
    return `trace=${this.steps.join(' → ')}`;
  }
}
