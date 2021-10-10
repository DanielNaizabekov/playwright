const { chromium } = require('playwright');

const target = 'https://app.clickup.com/';

const clickupEmail = 'EMAIL';
const clickupPassword = 'PASSWORD';

const convertHMS = timeString => {
  const arr = timeString.split(":");
  const seconds = arr[0]*3600 + arr[1]*60 + (+arr[2]);
  return seconds / 3600;
}

const wait = time => new Promise(resolve => setTimeout(resolve, time));

const scrollTop = async ({page, selector, y = 60}) => {
  await page.$eval(selector, (elem, y) => {
    elem.scrollTo({
      top: elem.scrollTop + y,
      behavior: 'smooth',
    });
  }, y);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(target);

  // login
  await page.type('#login-email-input', clickupEmail);
  await page.type('#login-password-input', clickupPassword);
  await page.dispatchEvent('.login-page-new__main-form-button', 'click');

  // expand all subtasks
  await page.dispatchEvent('.cu2-views-bar__options :text("subtasks")', 'click');
  await page.dispatchEvent('.ng-star-inserted :text("expand all")', 'click');

  // filter by me
  await page.dispatchEvent('.cu2-views-bar__options :text("me")', 'click');

  // show closed tasks
  await page.dispatchEvent('.cu2-views-bar__options :text("show")', 'click');
  await page.dispatchEvent('.ng-star-inserted :text("closed tasks")', 'click');
  await page.dispatchEvent('.ng-star-inserted :text("closed subtasks")', 'click');
  await page.keyboard.press('Escape');
  await wait(5000);

  // add time tracked column
  await page.dispatchEvent('cu-task-list-header-settings .cu-dropdown__toggle', 'click');
  await page.dispatchEvent('.columns-list__item-col-20', 'click');
  await wait(5000);

  // open infinity scroll
  const scrollList = async () => {
    const isScrolledDown = await page.$eval('.cu-if-not-task-view-scroll', elem => {
      return elem.scrollHeight - elem.scrollTop - elem.clientHeight < 1;
    });

    console.log('isScrolledDown', isScrolledDown);
    if (!isScrolledDown) {
      await scrollTop({
        page,
        selector: '.cu-if-not-task-view-scroll',
        y: 1000000,
      });

      await wait(3000);
      await scrollList();
    }
  }
  await scrollList();

  // parsing
  await page.waitForSelector('cu-task-row');
  const taskIds = await page.$$eval('cu-task-row', elems => elems.map(elem => elem.id));

  const tasks = [];
  for (const taskId of taskIds) {
    await page.hover(`#${taskId}`);

    const taskName = await page.$eval(`#${taskId} .cu-task-row-main__link-text-inner`, elem => elem.innerHTML);
    console.log(taskName);

    // open board
    await page.dispatchEvent(`#${taskId} time-tracking-display`, 'click');

    await wait(1000);
    const dataExists = await page.$eval('.time-tracking__items', elem => {
      const usernameElems = elem.querySelectorAll('.time-tracking__user-name');
      const usernames = [];

      usernameElems.forEach(elem => {
        usernames.push(elem.innerHTML.toLowerCase().trim());
      });

      return usernames.includes('me');
    });

    let times = []
    if (dataExists) {
      await page.dispatchEvent('.time-tracking__item :text("me")', 'click');

      // read times
      const durations = await page.$$eval('.cu-time-tracker-entry__duration', elems => elems.map(elem => elem.innerHTML));
      const dates = await page.$$eval('.cu-time-tracker-entry__start', elems => elems.map(elem => elem.innerHTML));
      times = durations.map((duration, index) => {
        return {
          duration: duration,
          date: dates[index],
        };
      });
      console.log('Times', times);
    } else {
      console.log('No data');
    }

    // close board
    tasks.push(...times);

    await page.keyboard.press('Escape');

    let taskElemHeight = await page.$eval(`#${taskId}`, elem => elem.offsetHeight);
    if (taskElemHeight > 200) {
      taskElemHeight = 200
    }
    await scrollTop({
      page,
      selector: '.cu-if-not-task-view-scroll',
      y: taskElemHeight,
    });
  }

  const groupedByMonth = {};
  tasks.forEach(({ duration, date }) => {
    const month = date.trim().split('').splice(0, 3).join('');
    groupedByMonth[month] = groupedByMonth[month] || 0;

    const formattedDuration = convertHMS(duration);
    groupedByMonth[month] += formattedDuration;
  });
  console.log(groupedByMonth);

  await browser.close();
})();
