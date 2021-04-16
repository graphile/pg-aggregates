drop schema if exists test cascade;

create schema test;
set search_path to test, public;

create table films (
  id serial primary key,
  name text not null,
  year_of_release int not null,
  box_office_in_billions float not null,
  duration_in_minutes int not null
);

create function films_computed_column(films films)
returns integer as $$
  SELECT films.duration_in_minutes + 10;
$$ language sql stable strict;
comment on function films_computed_column is E'Ten minutes longer than the film duration (in minutes).';

create function films_computed_column_with_arguments(films films, number_to_add int)
returns integer as $$
  SELECT films.duration_in_minutes + number_to_add;
$$ language sql stable strict;
comment on function films_computed_column_with_arguments is E'Your chosen number of minutes longer than the film duration (in minutes).';

insert into films (name, year_of_release, box_office_in_billions, duration_in_minutes) values
  ('Transformers: Dark of the Moon', 2011, 1.52, 154),
  ('Captain America: Civil War', 2016, 1.15, 147),
  ('Minions', 2015, 1.16, 91),
  ('Iron Man 3', 2013, 1.21, 131),
  ('Incredibles 2', 2018, 1.24, 118),
  ('The Fate of the Furious', 2017, 1.24, 136),
  ('Beauty and the Beast', 2017, 1.26, 129),
  ('Frozen', 2013, 1.29, 102),
  ('Jurassic World: Fallen Kingdom', 2018, 1.30, 128),
  ('Star Wars: The Last Jedi', 2017, 1.33, 152),
  ('Harry Potter and the Deathly Hallows: Part 2', 2011, 1.34, 130),
  ('Black Panther', 2018, 1.35, 134),
  ('Avengers: Age of Ultron', 2015, 1.41, 141),
  ('Furious 7', 2015, 1.52, 137),
  ('The Avengers', 2012, 1.52, 143),
  ('Jurassic World', 2018, 1.67, 124),
  ('Avengers: Infinity War', 2018, 2.05, 149),
  ('Star Wars: The Force Awakens', 2015, 2.07, 135),
  ('Titanic', 1997, 2.19, 195),
  ('Avatar', 2009, 2.79, 161);

create table players (
  id serial primary key,
  name text not null
);

insert into players (name) values
  ('BenjieG'),
  ('Purge'),
  ('HollaDolla'),
  ('Jmar25'),
  ('JutheKid');

create table matches (
  id serial primary key
);

insert into matches
  select from generate_series(1, 20);

create table match_stats (
  id serial primary key,
  match_id int not null references matches,
  player_id int not null references players,
  team_position int not null,
  points int not null,
  goals int not null,
  saves int not null,
  created_at timestamptz not null default now()
);

create view view_match_stats as (select * from match_stats);
comment on view view_match_stats is E'@foreignKey (match_id) references matches|@fieldName match|@foreignFieldName viewMatchStats
@foreignKey (player_id) references players|@fieldName player|@foreignFieldName viewMatchStats';

create function match_stats_rating(s match_stats, goal_weight float = 3, save_weight float = 1, position_weight float = 4) returns float as $$
  select s.goals * goal_weight + s.saves * save_weight + (6 - s.team_position) * position_weight;
$$ language sql strict stable;

insert into match_stats (match_id, player_id, team_position, points, goals, saves, created_at)
  select
    matches.id,
    players.id,
    (((7 * (players.id + matches.id)) + (players.id)) % 6) + 1,
    ((matches.id + 2) * players.id) * 432 % 473,
    (6 + matches.id + players.id) % 7,
    (2 + matches.id + players.id) % 3,
    '2020-10-22T17:42:24Z'::timestamptz + (floor(matches.id / 6) * interval '1 day' + (matches.id % 6) * interval '17 minutes 53 seconds')
  from matches, players
  where matches.id % 2 = players.id % 2
  and matches.id % (players.id + 1) > 0;
