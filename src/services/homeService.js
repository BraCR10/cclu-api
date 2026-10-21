const directoryService = require('./directoryService');
const jobBoardService = require('./jobBoardService');

const LATEST_VACANCIES = '3';

// What the public home page shows besides the plans: the businesses it puts
// first, the newest vacancies and how many of each there are.
async function readHome(
  now,
  {
    listFeatured = directoryService.listFeatured,
    countListed = directoryService.countListed,
    listBoard = jobBoardService.listBoard,
    countVacancies = jobBoardService.countBoardVacancies,
  } = {},
) {
  const [featured, members, board, vacancies] = await Promise.all([
    listFeatured(now),
    countListed(),
    listBoard({ pageSize: LATEST_VACANCIES }, now),
    countVacancies(now),
  ]);

  return { featured, vacancies: board.items, counts: { members, vacancies } };
}

module.exports = { readHome };
