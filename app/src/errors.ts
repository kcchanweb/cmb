export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) { super(message); }
}

export function invalid(message: string): never {
  throw new ApiError(422, 'INVALID_EVENT', message);
}
