-- NVM – Bestenliste in Supabase einrichten
-- In Supabase: SQL Editor → New query → alles einfügen → Run.

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  name       text        not null,
  score      integer     not null,
  level      smallint    not null,
  correct    smallint    not null,
  asked      smallint    not null,
  created_at timestamptz not null default now(),
  constraint name_format  check (char_length(name) between 2 and 16 and name ~ '^[A-Za-zÄÖÜäöüß0-9 ._-]+$'),
  constraint score_range  check (score between 0 and 1000000),
  constraint level_range  check (level between 1 and 50),
  constraint counts_ok    check (asked between 1 and 1000 and correct between 0 and asked),
  constraint score_plaus  check (score <= asked * 1500)          -- mehr als 1500 Punkte je Aufgabe sind nicht möglich
);

-- Namensfilter: dieselbe Liste wie in js/board.js
create or replace function public.nvm_name_ok(n text) returns boolean
language sql immutable as $$
  select not exists (
    select 1
    from unnest(array['arschloch', 'fick', 'fotze', 'hure', 'nute', 'wichser', 'schwuchtel', 'spast', 'misgeburt', 'kanake', 'neger', 'niger', 'niga', 'hitler', 'nazi', 'siegheil', 'fuck', 'shit', 'cunt', 'bitch', 'penis', 'vagina', 'porn', 'titen', 'muschi', 'schlampe', 'bastard', 'whore', 'slut', 'vergewalt']) as w
    where position(w in regexp_replace(regexp_replace(translate(lower(n), '0134578@$', 'oieastbas'), '[^a-zäöüß]', '', 'g'), '(.)\1+', '\1', 'g')) > 0
  );
$$;
alter table public.scores drop constraint if exists name_clean;
alter table public.scores add constraint name_clean check (public.nvm_name_ok(name));

create index if not exists scores_rank_idx on public.scores (score desc, created_at asc);

-- Zugriff aus dem Browser: lesen und neue Einträge anlegen, sonst nichts
alter table public.scores enable row level security;
drop policy if exists "Bestenliste lesen" on public.scores;
drop policy if exists "Ergebnis eintragen" on public.scores;
create policy "Bestenliste lesen"  on public.scores for select to anon using (true);
create policy "Ergebnis eintragen" on public.scores for insert to anon with check (true);
grant select, insert on public.scores to anon;
