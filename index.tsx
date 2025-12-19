
import { BoardState, Column, Card } from './types';
import { generateTaskSuggestions, refineCardDescription, summarizeBoard } from './services/geminiService';

// --- State and Persistence ---
let state: BoardState = {
  columns: [
    {
      id: 'col-1',
      title: 'To Do',
      cards: [
        { id: 'card-1', title: 'Welcome to EvalSpark!', description: 'Drag this card to another list to see it in action.', createdAt: Date.now() },
        { id: 'card-2', title: 'Try AI Task Generation', description: 'Click the wand icon in the column header.', createdAt: Date.now() }
      ]
    },
    { id: 'col-2', title: 'Doing', cards: [] },
    { id: 'col-3', title: 'Done', cards: [] }
  ]
};

function loadState() {
  const saved = localStorage.getItem('evalspark_board_data');
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch (e) {
      console.error("State loading error:", e);
    }
  }
}

function saveState() {
  localStorage.setItem('evalspark_board_data', JSON.stringify(state));
}

// --- DOM References ---
const boardContainer = document.getElementById('board-container')!;
const addColWrapper = document.getElementById('add-column-wrapper')!;
const btnShowAddCol = document.getElementById('btn-show-add-column')!;
const addColForm = document.getElementById('add-column-form')!;
const newColInput = document.getElementById('new-column-title') as HTMLInputElement;

// Modal/Offcanvas instances
let bootstrapModal: any;
let bootstrapOffcanvas: any;

// Global tracking
let currentEditingColId: string | null = null;
let currentEditingCardId: string | null = null;
let draggedCardId: string | null = null;

// --- Main Render Function ---

function render() {
  // Clear all list columns except the "Add List" wrapper
  const columns = boardContainer.querySelectorAll('.kanban-column');
  columns.forEach(c => c.remove());

  state.columns.forEach(colData => {
    const colEl = createColumnElement(colData);
    boardContainer.insertBefore(colEl, addColWrapper);
  });
}

function createColumnElement(colData: Column): HTMLElement {
  const col = document.createElement('div');
  col.className = 'kanban-column';
  col.dataset.id = colData.id;

  col.innerHTML = `
    <div class="column-header">
      <h2 class="column-title">${colData.title}</h2>
      <div class="d-flex align-items-center">
        <button class="ai-magic-btn me-1" data-action="ai-magic" title="Gemini Magic Suggest">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
        </button>
        <button class="btn btn-link btn-sm text-secondary p-1" data-action="delete-column">
          <i class="fa-solid fa-ellipsis-v"></i>
        </button>
      </div>
    </div>
    <div class="cards-container custom-scrollbar" data-col-id="${colData.id}"></div>
    <div class="add-card-area">
      <button class="add-card-btn" data-action="show-add-card">
        <i class="fa-solid fa-plus me-2"></i>Add a card
      </button>
      <div class="add-card-form d-none">
        <textarea class="form-control mb-2" placeholder="Card title..." rows="2"></textarea>
        <div class="d-flex gap-2">
          <button class="btn btn-success-custom btn-sm" data-action="confirm-add-card">Add</button>
          <button class="btn btn-link text-secondary p-0" data-action="cancel-add-card"><i class="fa-solid fa-xmark fs-4"></i></button>
        </div>
      </div>
    </div>
  `;

  const cardsContainer = col.querySelector('.cards-container')!;
  colData.cards.forEach(cardData => {
    const cardEl = createCardElement(cardData, colData.id);
    cardsContainer.appendChild(cardEl);
  });

  // Drag and Drop implementation
  cardsContainer.addEventListener('dragover', (e: any) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(cardsContainer as HTMLElement, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (draggable) {
      if (afterElement == null) {
        cardsContainer.appendChild(draggable);
      } else {
        cardsContainer.insertBefore(draggable, afterElement);
      }
    }
  });

  cardsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggedCardId) return;
    moveCardInState(draggedCardId, colData.id);
    saveState();
    render();
  });

  // Action Delegation
  col.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (action === 'show-add-card') {
      col.querySelector('.add-card-btn')?.classList.add('d-none');
      col.querySelector('.add-card-form')?.classList.remove('d-none');
      (col.querySelector('.add-card-form textarea') as HTMLTextAreaElement).focus();
    } else if (action === 'cancel-add-card') {
      col.querySelector('.add-card-btn')?.classList.remove('d-none');
      col.querySelector('.add-card-form')?.classList.add('d-none');
    } else if (action === 'confirm-add-card') {
      const ta = col.querySelector('.add-card-form textarea') as HTMLTextAreaElement;
      const title = ta.value.trim();
      if (title) {
        addCardToState(colData.id, title);
        saveState();
        render();
      }
    } else if (action === 'delete-column') {
      if (confirm(`Delete list "${colData.title}"?`)) {
        state.columns = state.columns.filter(c => c.id !== colData.id);
        saveState();
        render();
      }
    } else if (action === 'ai-magic') {
      handleMagicTaskGeneration(colData.id, colData.title, btn as HTMLButtonElement);
    }
  });

  return col;
}

function createCardElement(cardData: Card, colId: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.draggable = true;
  card.dataset.id = cardData.id;

  card.innerHTML = `
    <h3 class="card-title">${cardData.title}</h3>
    ${cardData.description ? '<div class="mt-2 text-muted" style="font-size: 0.75rem;"><i class="fa-solid fa-align-left"></i></div>' : ''}
  `;

  card.addEventListener('dragstart', () => {
    card.classList.add('dragging');
    draggedCardId = cardData.id;
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCardId = null;
  });

  card.addEventListener('click', () => {
    currentEditingColId = colId;
    currentEditingCardId = cardData.id;
    openCardModal(cardData);
  });

  return card;
}

// --- Card Operations ---

function addCardToState(colId: string, title: string, desc: string = '') {
  const col = state.columns.find(c => c.id === colId);
  if (col) {
    col.cards.push({
      id: `card-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      description: desc,
      createdAt: Date.now()
    });
  }
}

function moveCardInState(cardId: string, newColId: string) {
  let foundCard: Card | null = null;
  state.columns.forEach(col => {
    const idx = col.cards.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      [foundCard] = col.cards.splice(idx, 1);
    }
  });

  if (foundCard) {
    const newCol = state.columns.find(c => c.id === newColId);
    if (newCol) {
      newCol.cards.push(foundCard);
    }
  }
}

async function handleMagicTaskGeneration(colId: string, colTitle: string, btn: HTMLButtonElement) {
  const icon = btn.querySelector('i')!;
  const originalIconClass = icon.className;
  icon.className = 'fa-solid fa-spinner fa-spin';
  btn.disabled = true;

  const suggestions = await generateTaskSuggestions(colTitle);
  suggestions.forEach((s: any) => addCardToState(colId, s.title, s.description));

  icon.className = originalIconClass;
  btn.disabled = false;
  saveState();
  render();
}

// --- Drag and Drop Helper ---

function getDragAfterElement(container: HTMLElement, y: number) {
  const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
  return draggableElements.reduce((closest: any, child: any) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- Modal and Logic ---

function openCardModal(card: Card) {
  (document.getElementById('edit-card-title') as HTMLInputElement).value = card.title;
  (document.getElementById('edit-card-desc') as HTMLTextAreaElement).value = card.description;
  document.getElementById('modalCardTitleDisplay')!.innerText = card.title;
  bootstrapModal.show();
}

// --- Initialize App ---

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  render();

  // Initialize Bootstrap instances
  // @ts-ignore
  bootstrapModal = new bootstrap.Modal(document.getElementById('cardModal'));
  // @ts-ignore
  bootstrapOffcanvas = new bootstrap.Offcanvas(document.getElementById('aiAssistantOffcanvas'));

  // Navbar AI Toggle
  document.getElementById('ai-assistant-trigger')?.addEventListener('click', () => {
    bootstrapOffcanvas.show();
  });

  // Add Column Logic
  btnShowAddCol.addEventListener('click', () => {
    btnShowAddCol.classList.add('d-none');
    addColForm.classList.remove('d-none');
    newColInput.focus();
  });

  document.getElementById('btn-cancel-column')?.addEventListener('click', () => {
    btnShowAddCol.classList.remove('d-none');
    addColForm.classList.add('d-none');
    newColInput.value = '';
  });

  document.getElementById('btn-add-column')?.addEventListener('click', () => {
    const title = newColInput.value.trim();
    if (title) {
      state.columns.push({ id: `col-${Date.now()}`, title, cards: [] });
      saveState();
      render();
      newColInput.value = '';
      btnShowAddCol.classList.remove('d-none');
      addColForm.classList.add('d-none');
    }
  });

  // Modal: Save Changes
  document.getElementById('btn-save-card')?.addEventListener('click', () => {
    if (currentEditingColId && currentEditingCardId) {
      const col = state.columns.find(c => c.id === currentEditingColId);
      const card = col?.cards.find(c => c.id === currentEditingCardId);
      if (card) {
        card.title = (document.getElementById('edit-card-title') as HTMLInputElement).value;
        card.description = (document.getElementById('edit-card-desc') as HTMLTextAreaElement).value;
        saveState();
        render();
        bootstrapModal.hide();
      }
    }
  });

  // Modal: Delete
  document.getElementById('btn-delete-card')?.addEventListener('click', () => {
    if (currentEditingColId && currentEditingCardId) {
      const col = state.columns.find(c => c.id === currentEditingColId);
      if (col) {
        col.cards = col.cards.filter(c => c.id !== currentEditingCardId);
        saveState();
        render();
        bootstrapModal.hide();
      }
    }
  });

  // AI Summary Generation
  document.getElementById('btn-generate-summary')?.addEventListener('click', async () => {
    const loader = document.getElementById('ai-loading')!;
    const area = document.getElementById('ai-content-area')!;
    const btn = document.getElementById('btn-generate-summary') as HTMLButtonElement;

    loader.classList.remove('d-none');
    area.classList.add('opacity-50');
    btn.disabled = true;

    const summary = await summarizeBoard(state);
    document.getElementById('summary-text')!.innerText = summary;

    loader.classList.add('d-none');
    area.classList.remove('opacity-50');
    btn.disabled = false;
  });

  // AI Description Refinement
  document.getElementById('btn-ai-refine')?.addEventListener('click', async () => {
    const textarea = document.getElementById('edit-card-desc') as HTMLTextAreaElement;
    const btn = document.getElementById('btn-ai-refine') as HTMLButtonElement;
    const text = textarea.value.trim();

    if (!text) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Polishing...';

    const polished = await refineCardDescription(text);
    textarea.value = polished;

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wand-sparkles me-1"></i> AI Polish';
  });
});
