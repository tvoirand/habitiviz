/*
Script for Habitiviz.
*/

// global variables
const canvas_width = 500;
const canvas_height = 200;

// fetch habitica API credentials
let habitica_api_user_id;
let habitica_api_user_key;
let config_request = new XMLHttpRequest();
config_request.open("GET", "./config/config.json", false); // initialize synchronous request
config_request.onload = function() {
    // onload callback function
    if (config_request.readyState === 4) {
        if (config_request.status === 200 || config_requestfig.status == 0) {
            let config = JSON.parse(config_request.responseText);
            habitica_api_user_id = config.id;
            habitica_api_user_key = config.key;
        }
    }
};
config_request.send(); // send request to server

function get_week_number(d) {
    /*
    Get iso calendar week number (starts on mondays).
    Input:
        -d          Date instance
    Output:
        -week_nb    int
    */
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Get first day of year
    var year_start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    var week_nb = Math.ceil(((d - year_start) / 86400000 + 1) / 7);
    // Return array of year and week number
    return week_nb;
}

function date_to_YYYYmmdd(input_date) {
    /*
    Format date object to YYYYmmdd string.
    Input:
        -input_date     Date instance
    Output:
        -output_date    str
    */
    let year = input_date.getUTCFullYear();
    let month = input_date.getMonth() + 1;
    let day = input_date.getDate();
    let output_date =
        ("0000" + year).slice(-4) +
        ("00" + month).slice(-2) +
        ("00" + day).slice(-2);
    return output_date;
}

function load_habitica_history(graph) {
    /*
    Load habitica history data and apply it to a given graph.
    Input:
        -graph          Graph instance
    */

    // fetch local archived habitica history
    $.ajax({
        url: "data/habitica_tasks_history.csv",
        type: "GET",
        dataType: "text",
        cache: false,
        async: false,
        success: function(history_data) {
            graph.read_habitica_history(history_data, false);
        }
    });

    // fetch online habitica history data through ajax request
    $.ajax({
        url: "https://habitica.com/export/history.csv",
        type: "GET",
        dataType: "text",
        cache: false,
        async: false,
        beforeSend: function(xhr) {
            xhr.setRequestHeader("x-api-user", habitica_api_user_id);
            xhr.setRequestHeader("x-api-key", habitica_api_user_key);
        },
        success: function(history_data) {
            graph.read_habitica_history(history_data, true);
        }
    });
}

class Graph {
    /*
    Class defining a graph.
    */

    constructor() {
        this.cells = [];
        this.cell_size = 20;
        this.cells_spacing = 22;
        this.data = []; // contains for each date in history: {date: Date obj, tasks: list of str}
        this.cols = 40;
    }

    read_habitica_history(history_data, process_only_current_week) {
        /*
        Read data from habitica history files and apply it to this graph.
        This function assumes that the habitica history stores the occurences of each task in
        chronological order (oldest occurence appearing first in the file).
        Data format is an array containing for each day a date object and a list of tasks (str):
        [[Date object, [str, ...]], ...]
        Input:
            -history_data               str
            -process_only_current_week  bool
        */

        // split rows
        let rows = history_data.split("\n");

        // store tasks and their values in an object to check for rows where value unchanged
        let tasks_values = {};

        for (let i = 1; i < rows.length - 1; i++) {
            let cols = rows[i].split(",");

            // get this row's task name, performing date, and value
            let task = cols[0];
            let date = new Date(cols[3].slice(0, 10));
            let value = parseFloat(cols[4]);

            // ignore "Fumer" task
            if (task == "Fumer") {
                continue;
            }

            // avoid processing missed dailies or tasks with unchanged values
            if (task in tasks_values) {
                if (value <= tasks_values[task]) {
                    // value unchanged or decreased since last occurence of this task
                    tasks_values[task] = value; // store new value
                    continue; // do not process this row
                }
            }
            tasks_values[task] = value; // store this task's new value

            if (process_only_current_week) {
                // only process tasks performed in the current week
                let today = new Date();
                if (get_week_number(date) != get_week_number(today)) {
                    continue;
                }
            }

            // check if date is already in graph's data array
            let index = this.data.findIndex(
                element =>
                    date_to_YYYYmmdd(element.date) == date_to_YYYYmmdd(date)
            );
            if (index == -1) {
                // if first task found for this date, create a new item in graph's data array
                this.data.push({
                    date: date,
                    tasks: [task]
                });
            } else {
                // if date already in data array, add new task to this item's tasks list
                this.data[index].tasks.push(task);
            }
        }

        // sort data per date after adding it
        this.sort_data_per_date();
    }

    fill_cells() {
        /*
        Read this graph's data and compute cells positions and colors.
        */

        // get today week number
        let today_week_number = get_week_number(new Date());

        // loop through days
        for (let i = 0; i < this.cols * 7; i++) {
            // initiate variables
            let cell_date;
            let cell_x;
            let cell_y;
            let cell_color;
            let cell_tasks = [];
            let cell_week_number;

            // get date and week number
            cell_date = new Date();
            cell_date.setDate(cell_date.getDate() - i);
            cell_week_number = get_week_number(cell_date);

            // get cell position
            cell_x =
                500 -
                (today_week_number - cell_week_number + 1) * this.cells_spacing;
            cell_y = 20 + ((cell_date.getDay() + 6) % 7) * this.cells_spacing;

            // look for entries of this graph's data for this cell's date
            for (let j = 0; j < this.data.length - 2; j++) {
                if (
                    date_to_YYYYmmdd(cell_date) ==
                    date_to_YYYYmmdd(this.data[j].date)
                ) {
                    cell_tasks = cell_tasks.concat(this.data[j].tasks); // fill this cell's tasks
                }
            }

            // define this cell's color based on number of tasks performed
            if (cell_tasks.length == 0) {
                cell_color = [72, 72, 72];
            } else if (cell_tasks.length == 1) {
                cell_color = [99, 99, 99];
            } else if (cell_tasks.length == 2) {
                cell_color = [144, 144, 144];
            } else if (cell_tasks.length == 3) {
                cell_color = [180, 180, 180];
            } else if (4 <= cell_tasks.length) {
                cell_color = [212, 212, 212];
            }

            // add new cell to graph
            this.cells.push(
                new Cell(cell_x, cell_y, cell_color, cell_date, cell_tasks)
            );
        }
    }

    draw(sketch) {
        /*
        Draws this graph on a given sketch.
        Input:
            -sketch     p5js sketch object
        */
        for (let cell of this.cells) {
            sketch.fill(cell.color);
            sketch.square(cell.x, cell.y, this.cell_size);
        }
    }

    tooltip(sketch) {
        /*
        Function to display tooltip for this graph's cells.
        Input:
            -sketch     p5js sketch object
        */

        // loop through cells
        for (let cell of this.cells) {
            // check if mouse is over this cell
            if (cell.mouse_over(sketch.mouseX, sketch.mouseY, this.cell_size)) {
                // handle text display
                sketch.textSize(10);
                sketch.fill([250, 250, 250]);

                // create tooltip contents
                let tooltip_contents = `Date\n  ${date_to_YYYYmmdd(
                    cell.date_object
                )}\n`;
                tooltip_contents += `${cell.tasks.length} tasks\n`;
                if (cell.tasks.length > 5) {
                    for (let i = 0; i < 4; i++) {
                        tooltip_contents += `  ${cell.tasks[i]}\n`;
                    }
                    tooltip_contents += `  ...\n`;
                } else {
                    for (let task of cell.tasks) {
                        tooltip_contents += `  ${task}\n`;
                    }
                }

                // compute tooltip position
                let tooltip_width = 150;
                let tooltip_height = 100;
                let tooltip_ulx = sketch.mouseX + 10;
                let tooltip_uly = sketch.mouseY + 10;
                if (tooltip_ulx + tooltip_width > canvas_width) {
                    tooltip_ulx = sketch.mouseX - tooltip_width;
                }
                if (tooltip_uly + tooltip_height > canvas_height) {
                    tooltip_uly = sketch.mouseY - tooltip_height;
                }

                // display tooltip
                sketch.fill([0, 0, 0]); // background color
                sketch.rect(
                    tooltip_ulx,
                    tooltip_uly,
                    tooltip_width,
                    tooltip_height
                );
                sketch.fill([250, 250, 250]); // text color
                sketch.text(
                    tooltip_contents,
                    tooltip_ulx,
                    tooltip_uly,
                    tooltip_width,
                    tooltip_height
                );
            }
        }
    }

    sort_data_per_date() {
        /*
        Sort this graph's data per date.
        */

        // sort graph's data array
        this.data.sort(sort_graph_data);
        function sort_graph_data(a, b) {
            /*
            See: https://stackoverflow.com/questions/16096872/how-to-sort-2-dimensional-array-by-column-value
            */
            if (a.date === b.date) {
                return 0;
            } else {
                return a.date > b.date ? -1 : 1;
            }
        }
    }
}

class Cell {
    /*
    Class defining a cell in a graph.
    */

    constructor(x, y, color, date_object, tasks) {
        /*
        Constructor for the Cell class.
        Input:
            -x      int
            -y      int
            -color  [int, int, int]
        */
        this.x = x;
        this.y = y;
        this.color = color;
        this.date_object = date_object;
        this.tasks = tasks;
    }

    mouse_over(mouse_x, mouse_y, cell_size) {
        /*
        Check if mouse is over this cell.
        Input:
            -mouse_x    float
            -mouse_y    float
            -cell_siez  float
        Output:
            -           bool
        */

        if (
            this.x < mouse_x &&
            mouse_x < this.x + cell_size &&
            this.y < mouse_y &&
            mouse_y < this.y + cell_size
        ) {
            return true;
        } else {
            return false;
        }
    }
}

// creating graph showing total activities
let total_graph = new Graph();
load_habitica_history(total_graph);
total_graph.fill_cells();

// creating processing sketch
const s = sketch => {
    /*
    Function which takes a "sketch" object as argument and attaches properties such as setup and
    draw functions which are needed for a p5js sketch.
    See: https://github.com/processing/p5.js/wiki/Global-and-instance-mode
    */

    sketch.setup = function() {
        /*
        Processing setup function.
        Called one time at start.
        */
        let canvas = sketch.createCanvas(canvas_width, canvas_height);
        canvas.parent(habitiviz_canvas_div);
    };

    sketch.mousePressed = function() {
        /*
        P5.js mousePressed function calls total_graph tooltip function.
        */
        total_graph.tooltip(sketch);
    };

    sketch.draw = function() {
        /*
        Processing main loop function.
        */

        // initialisation
        sketch.background(0);
        sketch.noStroke();

        // drawing graph
        total_graph.draw(sketch);

        // write tooltip when hovering or clicking cells
        total_graph.tooltip(sketch);
    };
};
let myp5 = new p5(s);
