// The "All tasks" count on A1 (board: the badge on All tasks): the same to-do items A2 shows.
// A leader: L1's To do (the union's to-do list, cash to settle, LPs here, field borders to check). A member: A2's
// To do rows (today only "Your crop plan"; the board's other member rows need her task list, a design gap).
// Only mounted for a leader (the reads are the leader's).
import { usePlanClient } from '../plan/hooks';
import { useUnionOffers } from '../anchor/hooks';
import { useBorderJobs } from '../border/hooks';
import { useLeaderTodo, useUnionCash } from '../leader/hooks';

export function useLeaderTaskCount() {
  const api = usePlanClient();
  const cash = useUnionCash().data;
  const todo = useLeaderTodo(api, cash);
  const offers = useUnionOffers().data || [];
  const borders = useBorderJobs().data || [];
  const now = Date.now() / 1000;
  return (todo.data || []).length + (cash && cash.atHand > 0 ? 1 : 0)
    + offers.filter((o) => o.state === 1 && o.expires > now).length
    + borders.filter((j) => j.status !== 'minted').length;
}

export const MEMBER_TODO_ROWS = 1;   // A2 "To do": Your crop plan
