-- 003_derived_debt_status.sql
-- Debt status is derived from payments in application logic.
-- This trigger is a lightweight guard to keep status consistent when
-- payments are inserted or deleted.

create or replace function sync_debt_status_from_payments() returns trigger language plpgsql as $$
declare
  total_paid integer;
  debt_total integer;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    select
      coalesce(sum(dp.amount_paise), 0),
      d.amount_paise
    into total_paid, debt_total
    from debts d
    left join debt_payments dp on dp.debt_id = d.id and not dp.deleted_at is not null
    where d.id = coalesce(new.debt_id, old.debt_id);

    if debt_total is null then
      return null;
    end if;

    update debts
    set status = case
      when total_paid >= debt_total then 'cleared'
      when total_paid > 0 then 'partial'
      else 'open'
    end
    where id = coalesce(new.debt_id, old.debt_id);
  end if;

  if tg_op = 'DELETE' then
    select
      coalesce(sum(dp.amount_paise), 0),
      d.amount_paise
    into total_paid, debt_total
    from debts d
    left join debt_payments dp on dp.debt_id = d.id and not dp.deleted_at is not null
    where d.id = old.debt_id;

    if debt_total is null then
      return null;
    end if;

    update debts
    set status = case
      when total_paid >= debt_total then 'cleared'
      when total_paid > 0 then 'partial'
      else 'open'
    end
    where id = old.debt_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger sync_debt_status_from_payments
  after insert or update or delete on debt_payments
  for each row
  execute function sync_debt_status_from_payments();
