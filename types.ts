
export interface Card {
  id: string;
  title: string;
  description: string;
  createdAt: number;
}

export interface Column {
  id: string;
  title: string;
  cards: Card[];
}

export interface BoardState {
  columns: Column[];
}
