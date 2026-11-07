# Reach

The people we built this for are tenants asked to pay an advance, brokers who rent rooms,
and owners who want a record of who has the right to rent each room. The first version is
deliberately narrow: one verified broker can hold the right to rent one room for one
period, and a tenant can check that right without signing in.

We have a working testnet demo, but there is no public demo URL in the project yet. To try
it locally, follow the setup in the main README and fill in the variables in
[`app/.env.example`](../app/.env.example). It uses Hedera testnet and Arkiv Rabdi; the
sample rooms are clearly marked and cannot be purchased.

We have not kept a count of renter or broker interviews, so we cannot claim adoption or
report a conversion rate. The next useful check is to put the public verify page in front
of renters and see whether they can answer two questions quickly: who holds this room
right, and when does it end?

We plan to keep working on it after Mumbai. The next priorities are testing that verify
flow with renters, making long rental periods fit Arkiv's current lifetime limit, and
letting users own their Arkiv records without needing testnet tokens.
