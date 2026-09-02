import { Button } from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ConstructorGroupingItem } from './constructorTypes';

interface ConstructorGroupingChipsProps {
  selected: ConstructorGroupingItem[];
  available: ConstructorGroupingItem[];
  onChange: (ids: string[]) => void;
}

export default function ConstructorGroupingChips({
  selected,
  available,
  onChange,
}: ConstructorGroupingChipsProps) {
  const selectedIds = selected.map((item) => item.id);

  const remove = (id: string) => {
    onChange(selectedIds.filter((item) => item !== id));
  };

  const add = (id: string) => {
    if (selectedIds.includes(id)) {
      return;
    }
    onChange([...selectedIds, id]);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) {
      return;
    }
    const next = [...selectedIds];
    const [moved] = next.splice(result.source.index, 1);
    if (moved == null) {
      return;
    }
    next.splice(result.destination.index, 0, moved);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex flex-col gap-2 min-w-80">
        <span className="text-xs text-default-400">Групування результатів:</span>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="warehouse-statement-grouping">
            {(provided) => (
              <ol
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-col gap-1.5 m-0 p-0 list-none"
              >
                {selected.length === 0 ? (
                  <p className="text-sm text-default-400">Додайте виміри групування</p>
                ) : (
                  selected.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(drag, snapshot) => (
                        <li
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          style={{
                            ...drag.draggableProps.style,
                            marginLeft: index * 20,
                          }}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                            snapshot.isDragging
                              ? 'border-primary-300 bg-primary-50 shadow-md'
                              : 'border-default-200 bg-default-50/60'
                          }`}
                        >
                          <div
                            {...drag.dragHandleProps}
                            className="flex items-center justify-center shrink-0 text-default-300 cursor-grab active:cursor-grabbing hover:text-default-500"
                            aria-label={`Перетягнути ${item.label}`}
                          >
                            <DynamicIcon name="grip-vertical" size={16} />
                          </div>
                          <span className="w-5 shrink-0 text-xs font-semibold text-default-400 tabular-nums">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium text-default-800 whitespace-nowrap">
                            {item.label}
                          </span>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="shrink-0 ml-auto"
                            type="button"
                            aria-label={`Прибрати ${item.label}`}
                            onPress={() => remove(item.id)}
                          >
                            <DynamicIcon name="x" size={16} />
                          </Button>
                        </li>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </ol>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {available.length > 0 ? (
        <div className="w-max flex flex-col gap-2">
          <span className="text-xs text-default-400">Доступні рівні</span>
          <div className="flex flex-wrap gap-1.5 items-stretch">
            {available.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant="bordered"
                className="justify-start h-8"
                type="button"
                onPress={() => add(item.id)}
              >
                + {item.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
