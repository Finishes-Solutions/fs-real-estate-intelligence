-- AI usage by day, model and feature (site plans, Ask AI, briefs, place search, the nightly pipeline), from the token
-- counts OpenAI returns with every answer (lib/aiusage.mjs). Settings › AI model › Usage reads it through api/aiusage.
-- ai_usage_add(...) adds one request and its tokens atomically. Server (secret key) only: RLS on, no policies.
create table if not exists public.ai_usage (
  day date not null,
  model text not null,
  feature text not null,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  primary key (day, model, feature)
);
alter table public.ai_usage enable row level security;

create or replace function public.ai_usage_add(p_day date, p_model text, p_feature text, p_in bigint, p_cached bigint, p_out bigint, p_reasoning bigint)
returns void language sql security definer set search_path = public as $$
  insert into ai_usage (day, model, feature, requests, input_tokens, cached_tokens, output_tokens, reasoning_tokens)
  values (p_day, p_model, p_feature, 1, greatest(p_in, 0), greatest(p_cached, 0), greatest(p_out, 0), greatest(p_reasoning, 0))
  on conflict (day, model, feature) do update set
    requests = ai_usage.requests + 1,
    input_tokens = ai_usage.input_tokens + excluded.input_tokens,
    cached_tokens = ai_usage.cached_tokens + excluded.cached_tokens,
    output_tokens = ai_usage.output_tokens + excluded.output_tokens,
    reasoning_tokens = ai_usage.reasoning_tokens + excluded.reasoning_tokens
$$;
revoke all on function public.ai_usage_add(date, text, text, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ai_usage_add(date, text, text, bigint, bigint, bigint, bigint) to service_role;
