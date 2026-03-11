# Showcase Inventory

Краткое описание системы инвентаря для режима витрины.

## Как это работает

- Инвентарь подключён только в `ShowcaseMode`.
- Справа находится вертикальный язычок `Инвентарь`.
- По нажатию открывается компактная панель со слотами.
- В панели всегда `4` ячейки.
- Поддерживаются `6` фиксированных предметов:
  - `key` — ключ
  - `stone1` — камень 1
  - `stone2` — камень 2
  - `stone3` — камень 3
  - `stone4` — камень 4
  - `flute` — дудка
- В ячейках показываются только те предметы, которые реально добавлены в инвентарь.
- Предмет можно перетаскивать мышкой или пальцем по экрану.
- После отпускания предмет не дропается насовсем, а возвращается обратно в свою ячейку.

## Drag / Hit Test

Во время перетаскивания инвентарь умеет сообщать:

- какой предмет тянут;
- текущие координаты курсора или пальца;
- фазу перетаскивания: `start`, `move`, `end`;
- DOM-элемент под курсором через `elementFromPoint`.

Это сделано для последующего hit test по любым зонам интерфейса или сцены.

## Консольный доступ

В консоли доступен глобальный объект:

```js
window.showcaseInventory
```

### Базовые команды

```js
showcaseInventory.open()
showcaseInventory.close()
showcaseInventory.toggle()
showcaseInventory.clear()
showcaseInventory.listItems()
showcaseInventory.listCatalog()
showcaseInventory.hasItem("key")
showcaseInventory.addItem("key")
showcaseInventory.removeItem("key")
```

### Удобные команды по предметам

```js
showcaseInventory.addKey()
showcaseInventory.removeKey()

showcaseInventory.addStone1()
showcaseInventory.removeStone1()

showcaseInventory.addStone2()
showcaseInventory.removeStone2()

showcaseInventory.addStone3()
showcaseInventory.removeStone3()

showcaseInventory.addStone4()
showcaseInventory.removeStone4()

showcaseInventory.addFlute()
showcaseInventory.removeFlute()
```

## Примеры

Добавить ключ:

```js
showcaseInventory.addKey()
```

Добавить дудку:

```js
showcaseInventory.addFlute()
```

Удалить камень 3:

```js
showcaseInventory.removeStone3()
```

Проверить текущее содержимое:

```js
showcaseInventory.listItems()
```

## Подписка на перетаскивание

```js
const unsubscribe = showcaseInventory.subscribeDrag((event) => {
  console.log(event.itemId, event.phase, event.clientX, event.clientY, event.hitTarget);
});
```

Отписка:

```js
unsubscribe()
```
