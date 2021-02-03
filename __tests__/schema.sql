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
