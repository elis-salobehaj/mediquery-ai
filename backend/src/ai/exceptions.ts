export class QuotaExceededException extends Error {
  constructor(
    public readonly userId: string,
    public readonly used: number,
    public readonly limit: number,
    public readonly month: string,
  ) {
    super(`Monthly token quota exceeded for user ${userId}. Used: ${used}, Limit: ${limit}.`);
    this.name = 'QuotaExceededException';
  }
}
