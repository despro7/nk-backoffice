import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// --- АЛГОРИТМ РЕКОМЕНДАЦИЙ КОРОБОК ДЛЯ УПАКОВКИ ---
// ============================================================================

// Определяем тип для коробки, чтобы TypeScript понимал структуру
type Box = {
  marking: string;
  qntFrom: number;
  qntTo: number;
  name: string;
  overflow: number; // Индивидуальное значение переполнения для каждой коробки
};

function formatResponse(mode: 'spacious' | 'economical', totalPortions: number, solution: any) {
  if (!solution || !solution.box) {
    return { mode, totalPortions, error: 'Не удалось найти подходящее решение для упаковки.' };
  }
  const { box, boxCount, portionsPerBox } = solution;
  const details = [];
  const hasOverflow = portionsPerBox > box.qntTo;
  for (let i = 0; i < boxCount; i++) {
    let detail = `Коробка ${box.marking}: ${portionsPerBox.toFixed(2)} из ${box.qntTo} порций`;
    if (hasOverflow) {
      const overflow = portionsPerBox - box.qntTo;
      const maxAllowedOverflow = box.overflow || 1; // Используем индивидуальное значение или значение по умолчанию
      detail += ` (превышение на ${overflow.toFixed(2)}, допустимо до ${maxAllowedOverflow})`;
    }
    details.push(detail);
  }
  const response = {
    mode,
    boxes: Array(boxCount).fill(box),
    totalPortions,
    boxCount,
    totalCapacity: boxCount * box.qntTo,
    details,
    hasOverflow: false,
    overflowWarning: false
  };
  if (mode === 'economical' && hasOverflow) {
    response.hasOverflow = true;
    response.overflowWarning = true;
  }
  return response;
}

function findEconomicalSolution(portionsCount: number, availableBoxes: Box[]) {
  let bestSolution = { box: null as Box | null, boxCount: Infinity, portionsPerBox: 0 };
  for (const box of availableBoxes) {
    // Используем индивидуальное значение overflow для каждой коробки вместо фиксированного значения [2]
    const numBoxes = Math.ceil(portionsCount / (box.qntTo + box.overflow));
    if (numBoxes <= 0) continue;
    const portionsPerBox = portionsCount / numBoxes;
    const overflowPerBox = portionsPerBox - box.qntTo;
    // Проверяем, что переполнение не превышает индивидуально заданное значение
    if (overflowPerBox <= box.overflow) {
      if (numBoxes < bestSolution.boxCount) {
        bestSolution = { box, boxCount: numBoxes, portionsPerBox };
      } else if (numBoxes === bestSolution.boxCount && bestSolution.box && box.qntTo < bestSolution.box.qntTo) {
        bestSolution = { box, boxCount: numBoxes, portionsPerBox };
      }
    }
  }
  return bestSolution.boxCount === Infinity ? null : bestSolution;
}

function getEconomicalPackaging(portionsCount: number, boxes: Box[]) {
  const sortedBoxes = [...boxes].sort((a, b) => a.qntTo - b.qntTo);
  const solution = findEconomicalSolution(portionsCount, sortedBoxes);
  return formatResponse('economical', portionsCount, solution);
}

function findBestUniformSolution(portionsCount: number, availableBoxes: Box[]) {
  let bestSolution = { boxCount: Infinity, box: null as Box | null, portionsPerBox: 0 };
  for (const box of availableBoxes) {
    const numBoxes = Math.ceil(portionsCount / box.qntTo);
    if (numBoxes <= 1) continue;
    const portionsPerBox = portionsCount / numBoxes;
    if (portionsPerBox >= box.qntFrom && portionsPerBox <= box.qntTo) {
      if (numBoxes < bestSolution.boxCount) {
        bestSolution = { box, boxCount: numBoxes, portionsPerBox };
      }
    }
  }
  return bestSolution.boxCount === Infinity ? null : bestSolution;
}

function getSpaciousPackaging(portionsCount: number, boxes: Box[]) {
  const sortedBoxes = [...boxes].sort((a, b) => a.qntTo - b.qntTo);
  for (const box of sortedBoxes) {
    if (portionsCount >= box.qntFrom && portionsCount <= box.qntTo) {
      const solution = { box, boxCount: 1, portionsPerBox: portionsCount };
      return formatResponse('spacious', portionsCount, solution);
    }
  }
  const uniformSolution = findBestUniformSolution(portionsCount, sortedBoxes);
  const singleLargeBox = sortedBoxes.find(box => portionsCount <= box.qntTo);
  let singleLargeBoxSolution = null;
  if (singleLargeBox) {
    singleLargeBoxSolution = { box: singleLargeBox, boxCount: 1, portionsPerBox: portionsCount };
  }
  if (uniformSolution && (!singleLargeBoxSolution || uniformSolution.boxCount <= singleLargeBoxSolution.boxCount)) {
    return formatResponse('spacious', portionsCount, uniformSolution);
  }
  if (singleLargeBoxSolution) {
    return formatResponse('spacious', portionsCount, singleLargeBoxSolution);
  }
  return formatResponse('spacious', portionsCount, null);
}


// ============================================================================
// --- ВАШИ СУЩЕСТВУЮЩИЕ ENDPOINTS ---
// ============================================================================


// Получить все коробки
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { all } = req.query; // Добавляем параметр all

    const whereClause =
      all === "true"
        ? {} // Все коробки
        : { isActive: true }; // Только активные

    const boxes = await prisma.settingsBoxes.findMany({
      where: whereClause,
      orderBy: { name: "asc" },
    });

    res.json(boxes);
  } catch (error) {
    console.error("Error fetching boxes:", error);
    res.status(500).json({ error: "Failed to fetch boxes" });
  }
});

// ... (остальные ваши endpoints остаются без изменений) ...
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const box = await prisma.settingsBoxes.findUnique({
      where: { id: parseInt(id) },
    });

    if (!box) {
      return res.status(404).json({ error: "Box not found" });
    }

    res.json(box);
  } catch (error) {
    console.error("Error fetching box:", error);
    res.status(500).json({ error: "Failed to fetch box" });
  }
});

router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      marking,
      qntFrom,
      qntTo,
      width,
      height,
      length,
      overflow,
      weight,
      self_weight,
      description,
    } = req.body;
    const existingBox = await prisma.settingsBoxes.findFirst({
      where: { name },
    });

    if (existingBox) {
      return res
        .status(400)
        .json({ error: "Box with this name already exists" });
    }

    const box = await prisma.settingsBoxes.create({
      data: {
        name,
        marking,
        qntFrom,
        qntTo,
        width,
        height,
        length,
        overflow,
        weight,
        self_weight,
        description,
        isActive: true,
      },
    });

    res.status(201).json(box);
  } catch (error) {
    console.error("Error creating box:", error);
    res.status(500).json({ error: "Failed to create box" });
  }
});

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const box = await prisma.settingsBoxes.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.json(box);
  } catch (error) {
    console.error("Error updating box:", error);
    res.status(500).json({ error: "Failed to update box" });
  }
});

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.settingsBoxes.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Box deleted successfully" });
  } catch (error) {
    console.error("Error deleting box:", error);
    res.status(500).json({ error: "Failed to delete box" });
  }
});

router.post("/recommendations", authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "Items array is required" });
    }

    const totalWeight = items.reduce(
      (sum, item) => sum + item.weight * item.quantity,
      0,
    );
    const allBoxes = await prisma.settingsBoxes.findMany({
      where: { isActive: true },
      orderBy: { weight: "asc" },
    });
    const recommendedBoxes = [];
    let remainingWeight = totalWeight;

    for (const box of allBoxes) {
      if (remainingWeight <= 0) break;

      if (remainingWeight <= Number(box.weight)) {
        recommendedBoxes.push(box);
        remainingWeight = 0;
        break;
      }

      const boxCount = Math.ceil(remainingWeight / Number(box.weight));
      for (let i = 0; i < boxCount; i++) {
        recommendedBoxes.push(box);
      }
      remainingWeight = 0;
    }

    res.json({
      boxes: recommendedBoxes,
      totalWeight,
      remainingWeight,
    });
  } catch (error) {
    console.error("Error getting box recommendations:", error);
    res.status(500).json({ error: "Failed to get box recommendations" });
  }
});


// ============================================================================
// --- ОБНОВЛЕННЫЙ ENDPOINT ---
// ============================================================================
router.get("/recommendations/:portions", authenticateToken, async (req, res) => {
  try {
    const { portions } = req.params;
    const { mode } = req.query; // Получаем режим из query-параметров
    const portionsCount = parseInt(portions, 10);

    if (isNaN(portionsCount) || portionsCount <= 0) {
      return res
        .status(400)
        .json({ error: "Valid portions count is required" });
    }

    // Получаем все активные коробки из БД
    const allBoxes = await prisma.settingsBoxes.findMany({
      where: { isActive: true },
    });

    let result;

    // Выбираем алгоритм в зависимости от параметра `mode`
    if (mode === 'economical') {
      result = getEconomicalPackaging(portionsCount, allBoxes);
    } else {
      // По умолчанию используется оптимальный (spacious) режим
      result = getSpaciousPackaging(portionsCount, allBoxes);
    }

    res.json(result);

  } catch (error) {
    console.error("Error getting box recommendations by portions:", error);
    res.status(500).json({ error: "Failed to get box recommendations" });
  }
});


export default router;