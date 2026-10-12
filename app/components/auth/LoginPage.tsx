import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '~/components/ui/icons';
import { AuthSplit } from './AuthSplit';

/*
 * /login: sign in, sign up (Signup board), a bad invite code (Signin-Error board) and closed sign-ups (Signups-Closed).
 * The action in routes/login.tsx answers {error, field}; the message lands under that field.
 */
type Field = 'name' | 'email' | 'password' | 'invite';
type Errors = Partial<Record<Field | 'form', string>>;

export interface LoginData {
  inviteRequired: boolean;
  signupsOpen: boolean;
  event: string;
  endsAt: number | null;
  next: string; // same-origin path to return to after signing in ('' = home)
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELDS: Field[] = ['name', 'email', 'password', 'invite'];

// same rules as the action, checked before the round trip so mistakes show under the field right away
function validate(form: FormData, signup: boolean, inviteRequired: boolean): Errors {
  const errors: Errors = {};
  const get = (k: string) => String(form.get(k) ?? '').trim();

  if (signup && get('name').replace(/\s+/g, ' ').length < 2) {
    errors.name = 'Add your name or team name (2+ characters).';
  }

  if (!EMAIL.test(get('email'))) {
    errors.email = 'Enter a valid email address.';
  }

  if (signup ? String(form.get('password') ?? '').length < 8 : !form.get('password')) {
    errors.password = signup ? 'Use at least 8 characters for your password.' : 'Enter your password.';
  }

  if (signup && inviteRequired && !get('invite')) {
    errors.invite = 'Enter the invite code from your organizer.';
  }

  return errors;
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="m-0 mt-[2px] flex items-start gap-2 text-[13px] leading-[1.45] text-error">
      <Icon.Alert className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Row({ id, label, error, help, children }: { id: string; label: string; error?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className="input-label">
        {label}
      </label>
      {children}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : help}
    </div>
  );
}

const describedBy = (id: string, error?: string, help = false) => (error ? `${id}-error` : help ? `${id}-help` : undefined);

// red border comes from `input`; the board adds a soft red ring too
const field = 'input aria-[invalid=true]:shadow-[0_0_0_3px_rgba(180,35,24,.12)]';

const withNext = (href: string, next: string) => (next ? `${href}${href.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : href);

function SignupsClosed({ next }: { next: string }) {
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-7" data-testid="foldo-signups-closed">
      <span className="pill-warning self-start">
        <span className="pill-dot" aria-hidden="true" />
        Sign-ups closed
      </span>
      <h1 className="m-0 text-balance font-serif text-[56px] font-normal leading-[.94] tracking-[-.02em] md:text-[72px]">
        Sign-ups are closed right now.
      </h1>
      <p className="m-0 text-pretty text-[17px] leading-[1.55] text-ink2">Already have an account? Sign in to keep building.</p>
      <div className="flex flex-wrap items-center gap-3">
        <a href={withNext('/login', next)} className="btn-dark btn-lg min-h-[48px] px-[22px]">
          Sign in <Icon.ArrowRight />
        </a>
        <a href="/gallery" className="btn-secondary btn-lg min-h-[48px] px-5">
          Browse the gallery
        </a>
      </div>
      <p className="m-0 text-pretty border-t border-solid border-rule pt-5 text-[14px] text-pencil">
        Think this is a mistake? An organizer at the help desk can reopen sign-ups.
      </p>
    </div>
  );
}

export function LoginPage() {
  const result = useActionData() as { error?: string; field?: string } | undefined;
  const { inviteRequired, signupsOpen: open, event, endsAt, next } = useLoaderData() as LoginData;
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod?.toUpperCase() === 'POST';
  const signup = params.get('mode') === 'register';
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [closesAt, setClosesAt] = useState('');

  // closing time in the visitor's clock, after hydration (the server's timezone may differ)
  useEffect(() => {
    setClosesAt(endsAt && endsAt > Date.now() ? new Date(endsAt).toTimeString().slice(0, 5) : '');
  }, [endsAt]);

  // a server answer replaces what the browser checked; it lands under the field it is about
  useEffect(() => {
    if (result?.error) {
      const f = FIELDS.find((x) => x === result.field);
      setErrors(f ? { [f]: result.error } : { form: result.error });

      if (f) {
        document.querySelector<HTMLElement>(`[data-testid=foldo-auth-form] [name="${f}"]`)?.focus();
      }
    }
  }, [result]);

  // switching between sign-in and sign-up starts clean
  useEffect(() => {
    setErrors({});
    setShow(false);
  }, [signup]);

  if (signup && !open) {
    return (
      <AuthSplit panel="closed" eventName={event} closesAt={closesAt}>
        <SignupsClosed next={next} />
      </AuthSplit>
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const found = validate(new FormData(e.currentTarget), signup, inviteRequired);
    const first = FIELDS.find((f) => found[f]);

    if (first) {
      e.preventDefault();
      setErrors(found);
      e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    } else {
      setErrors({});
    }
  };

  const clear = (f: Field) => () => {
    if (errors[f] || errors.form) {
      setErrors(({ [f]: _gone, form: _form, ...rest }) => rest);
    }
  };

  return (
    <AuthSplit panel={signup && errors.invite && result?.field === 'invite' ? 'invite' : 'welcome'} eventName={event} closesAt={closesAt}>
      <div className="flex w-full max-w-[420px] flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="m-0 font-serif text-[56px] font-normal leading-[.92] tracking-[-.02em] md:text-[72px]">
            {signup ? 'Make something.' : 'Welcome back.'}
          </h1>
          <p className="m-0 text-[17px] text-ink2">
            {signup ? (event ? `Join ${event} and start building.` : 'Create an account to start building.') : 'Sign in to pick up where you left off.'}
          </p>
        </div>

        <Form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-[18px]" data-testid="foldo-auth-form">
          {signup && (
            <Row id="name" label="Name or team" error={errors.name}>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="nickname"
                maxLength={40}
                required
                placeholder="Team Dachshund"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={describedBy('name', errors.name)}
                onInput={clear('name')}
                className={field}
              />
            </Row>
          )}
          <Row id="email" label="Email" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus={!signup}
              required
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy('email', errors.email)}
              onInput={clear('email')}
              className={field}
            />
          </Row>
          <Row
            id="password"
            label="Password"
            error={errors.password}
            help={
              signup && (
                <span id="password-help" className="inline-flex items-center gap-[6px] text-[13px] text-pencil">
                  {password.length >= 8 ? (
                    <Icon.Check size={14} className="shrink-0 text-live" />
                  ) : (
                    <span aria-hidden="true" className="mx-[3px] h-[8px] w-[8px] shrink-0 rounded-full border border-solid border-field" />
                  )}
                  At least 8 characters
                </span>
              )
            }
          >
            <div className="relative flex">
              <input
                id="password"
                name="password"
                type={show ? 'text' : 'password'}
                autoComplete={signup ? 'new-password' : 'current-password'}
                required
                minLength={signup ? 8 : undefined}
                placeholder={signup ? undefined : 'Your password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clear('password')();
                }}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={describedBy('password', errors.password, signup)}
                className={`${field} flex-1 pr-[72px]`}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-controls="password"
                className="absolute right-1 top-1 h-[38px] cursor-pointer rounded-[6px] border-0 bg-transparent px-3 font-sans text-[13px] font-semibold text-ink2 underline decoration-field underline-offset-3 outline-none hover:text-ink focus-visible:shadow-[0_0_0_2px_#16140F]"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </Row>
          {signup && inviteRequired && (
            <Row
              id="invite"
              label="Invite code"
              error={errors.invite}
              help={
                <span id="invite-help" className="input-help">
                  Your organizer shares this at the event.
                </span>
              }
            >
              <input
                id="invite"
                name="invite"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                required
                placeholder="From your organizer"
                aria-invalid={Boolean(errors.invite)}
                aria-describedby={describedBy('invite', errors.invite, true)}
                onInput={clear('invite')}
                className={`${field} font-mono`}
              />
            </Row>
          )}

          {errors.form && <FieldError id="form-error">{errors.form}</FieldError>}
          {next && <input type="hidden" name="next" value={next} />}

          <button
            name="intent"
            value={signup ? 'register' : 'login'}
            aria-busy={busy || undefined}
            disabled={busy}
            className="btn-dark btn-lg mt-[6px] min-h-[48px] w-full"
          >
            {busy && <Icon.Spinner />}
            {signup ? 'Create account' : 'Sign in'}
            {!busy && <Icon.ArrowRight />}
          </button>
          {signup && (
            <p className="m-0 text-pretty text-[13px] text-pencil">
              By creating an account you agree to the event's{' '}
              <a href="/conduct" className="text-ink2 underline underline-offset-3">
                code of conduct
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-ink2 underline underline-offset-3">
                privacy notice
              </a>
              .
            </p>
          )}
        </Form>

        <p className="m-0 border-t border-solid border-rule pt-5 text-[14px] text-ink2">
          {signup ? 'Have an account?' : 'New here?'}{' '}
          <a href={withNext(signup ? '/login' : '/login?mode=register', next)} className="font-semibold text-ink underline underline-offset-3">
            {signup ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </div>
    </AuthSplit>
  );
}
