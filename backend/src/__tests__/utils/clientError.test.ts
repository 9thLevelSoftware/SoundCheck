import { BadRequestError } from '../../utils/errors';
import { clientErrorMessage, clientErrorStack } from '../../utils/clientError';

describe('client error envelope', () => {
  const originalFlag = process.env.EXPOSE_STACK_TRACES;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.EXPOSE_STACK_TRACES;
    } else {
      process.env.EXPOSE_STACK_TRACES = originalFlag;
    }
  });

  it('returns AppError text and hides other 4xx messages', () => {
    expect(clientErrorMessage(new BadRequestError('Rating must be in 0.5 increments'), 400)).toBe(
      'Rating must be in 0.5 increments'
    );
    expect(
      clientErrorMessage(new Error('duplicate key value violates unique constraint'), 400)
    ).toBe('Invalid request');
    expect(clientErrorMessage(new Error('password leaked'), 500)).toBe('Internal server error');
  });

  it('includes a stack only when EXPOSE_STACK_TRACES is true', () => {
    const error = new Error('boom');
    delete process.env.EXPOSE_STACK_TRACES;
    process.env.NODE_ENV = 'development';
    expect(clientErrorStack(error)).toBeUndefined();

    process.env.EXPOSE_STACK_TRACES = 'true';
    expect(clientErrorStack(error)).toBe(error.stack);
  });
});
