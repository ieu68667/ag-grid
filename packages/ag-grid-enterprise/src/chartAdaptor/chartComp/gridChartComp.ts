import {
    _,
    Autowired,
    ChartType,
    Component,
    Dialog,
    PostConstruct,
    RefSelector,
    CellRange,
    ResizeObserverService
} from "ag-grid-community";
import {GridChartFactory} from "./gridChartFactory";
import {Chart} from "../../charts/chart/chart";
import {BarSeries} from "../../charts/chart/series/barSeries";
import {LineSeries} from "../../charts/chart/series/lineSeries";
import {PieSeries} from "../../charts/chart/series/pieSeries";
import colors from "../../charts/chart/colors";
import {CartesianChart} from "../../charts/chart/cartesianChart";
import {PolarChart} from "../../charts/chart/polarChart";
import {ChartMenu} from "./menu/chartMenu";
import {ChartController} from "./chartController";
import {ChartColumnModel} from "./model/chartColumnModel";

export interface ChartOptions {
    chartType: ChartType;
    insideDialog: boolean;
    showTooltips: boolean;
    aggregate: boolean;
    height: number;
    width: number;
}

export class GridChartComp extends Component {
    private static TEMPLATE =
        `<div class="ag-chart" tabindex="-1">
            <div ref="eChart" class="ag-chart-canvas-wrapper"></div>
        </div>`;

    @Autowired('resizeObserverService') private resizeObserverService: ResizeObserverService;

    @RefSelector('eChart') private eChart: HTMLElement;

    private chartController: ChartController;

    private chart: Chart<any, string, number>;
    private chartDialog: Dialog;
    private chartMenu: ChartMenu;

    private currentChartType: ChartType;
    private readonly chartOptions: ChartOptions;
    private readonly cellRanges: CellRange[];

    constructor(chartOptions: ChartOptions, cellRanges: CellRange[]) {
        super(GridChartComp.TEMPLATE);
        this.chartOptions = chartOptions;
        this.cellRanges = cellRanges;
    }

    @PostConstruct
    public init(): void {
        this.chartController = new ChartController(this.chartOptions, this.cellRanges);
        this.getContext().wireBean(this.chartController);

        this.createChart();

        if (this.chartController.isInsideDialog()) {
            this.addDialog();
        }

        this.addMenu();
        this.addResizeListener();

        this.addDestroyableEventListener(this.getGui(), 'focusin', this.setGridChartEditMode.bind(this));
        this.addDestroyableEventListener(this.chartController, ChartController.EVENT_CHART_MODEL_UPDATED, this.refresh.bind(this));
        this.addDestroyableEventListener(this.chartMenu, ChartMenu.EVENT_DOWNLOAD_CHART, this.downloadChart.bind(this));

        this.refresh();
    }

    private createChart() {
        // destroy chart and remove it from DOM
        if (this.chart) {
            this.chart.destroy();
            _.clearElement(this.eChart);
        }

        const chartOptions = {
            chartType: this.chartController.getChartType(),
            parentElement: this.eChart,
            width: this.chartController.getWidth(),
            height: this.chartController.getHeight(),
            showTooltips: this.chartController.isShowTooltips()
        };

        this.chart = GridChartFactory.createChart(chartOptions);
        this.currentChartType = this.chartController.getChartType();
    }

    private addDialog() {
        this.chartDialog = new Dialog({
            resizable: true,
            movable: true,
            title: '',
            component: this,
            centered: true,
            closable: true
        });
        this.getContext().wireBean(this.chartDialog);

        this.chartDialog.addEventListener(Dialog.EVENT_DESTROYED, () => this.destroy());
    }

    private addMenu() {
        this.chartMenu = new ChartMenu(this.chartController);
        this.getContext().wireBean(this.chartMenu);

        const eChart: HTMLElement = this.getGui();
        eChart.appendChild(this.chartMenu.getGui());
    }

    private refresh(): void {
        if (this.chartController.getChartType() !== this.currentChartType) {
            this.createChart();
        }
        this.updateChart();
    }

    public updateChart() {
        const chartType = this.chartController.getChartType();

        if (chartType === ChartType.GroupedBar || chartType === ChartType.StackedBar) {
            this.updateBarChart();

        } else if (chartType === ChartType.Line) {
            this.updateLineChart();

        } else if (chartType === ChartType.Pie) {
            this.updatePieChart();
        }
    }

    private updateBarChart() {
        const barSeries = this.chart.series[0] as BarSeries<any, string, number>;

        const categoryId = this.chartController.getSelectedCategory();
        const barChart = barSeries.chart as CartesianChart<any, string, number>;
        barChart.xAxis.labelRotation = categoryId === ChartColumnModel.DEFAULT_CATEGORY ? 0 : -90;

        barSeries.data = this.chartController.getData();
        barSeries.xField = categoryId;
        barSeries.yFields = this.chartController.getFields().map(f => f.colId);
        barSeries.yFieldNames = this.chartController.getFields().map(f => f.displayName);
    }

    private updateLineChart() {
        const data = this.chartController.getData();
        const categoryId = this.chartController.getSelectedCategory();
        const fields = this.chartController.getFields();

        const lineChart = this.chart as CartesianChart<any, string, number>;
        lineChart.xAxis.labelRotation = categoryId === ChartColumnModel.DEFAULT_CATEGORY ? 0 : -90;

        lineChart.removeAllSeries();

        lineChart.series = fields.map((f: {colId: string, displayName: string}, index: number)  => {
            const lineSeries = new LineSeries<any, string, number>();

            lineSeries.name = f.displayName;

            lineSeries.tooltip = this.chartController.isShowTooltips();
            lineSeries.lineWidth = 2;
            lineSeries.markerRadius = 3;
            lineSeries.color = colors[index % colors.length];

            lineSeries.data = this.chartController.getData();
            lineSeries.xField = categoryId;
            lineSeries.yField = f.colId;

            return lineSeries;
        });
    }

    private updatePieChart() {
        const data = this.chartController.getData();
        const categoryId = this.chartController.getSelectedCategory();
        const fields = this.chartController.getFields();

        const pieChart = this.chart as PolarChart<any, string, number>;

        const singleField = fields.length === 1;
        const thickness = singleField ? 0 : 20;
        const padding = singleField ? 0 : 10;
        let offset = 0;

        pieChart.removeAllSeries();

        pieChart.series = fields.map((f: {colId: string, displayName: string}) => {
            const pieSeries = new PieSeries<any, string, number>();

            pieSeries.name = f.displayName;

            pieSeries.tooltip = this.chartController.isShowTooltips();
            pieSeries.lineWidth = 1;
            pieSeries.calloutWidth = 1;
            pieChart.addSeries(pieSeries);

            pieSeries.outerRadiusOffset = offset;
            offset -= thickness;
            pieSeries.innerRadiusOffset = offset;
            offset -= padding;

            pieSeries.data = data;
            pieSeries.angleField = f.colId;

            pieSeries.labelField = categoryId;
            pieSeries.label = false;

            return pieSeries;
        });
    }

    private downloadChart() {
        // TODO use chart / dialog title for filename
        this.chart.scene.download("chart");
    }

    private addResizeListener() {
        const eGui = this.getGui();
        const eParent = eGui.parentElement as HTMLElement;

        const observeResize = this.resizeObserverService.observeResize(eGui, () => {
            if (!eGui || !eGui.offsetParent) {
                observeResize();
                return;
            }
            this.chartController.setHeight(_.getInnerHeight(eParent));
            this.chartController.setWidth(_.getInnerWidth(eParent));

            this.chart.height = this.chartController.getHeight();
            this.chart.width = this.chartController.getWidth();
        });
    }

    private setGridChartEditMode(focusEvent: FocusEvent) {
        if (this.getGui().contains(focusEvent.relatedTarget as HTMLElement)) return;
        this.chartController.setChartCellRangesInRangeController();
    }

    public destroy(): void {
        super.destroy();

        if (this.chartController) {
            this.chartController.removeChartCellRangesFromRangeController();
            this.chartController.destroy();
        }
        if (this.chart) {
            this.chart.destroy();
        }
        if (this.chartMenu) {
            this.chartMenu.destroy();
        }

        // don't want to invoke destroy() on the Dialog / MessageBox (prevents destroy loop)
        if (this.chartDialog && this.chartDialog.isAlive()) {
            this.chartDialog.destroy();
        }

        // if the user is providing containers for the charts, we need to clean up, otherwise the old chart
        // data will still be visible although the chart is no longer bound to the grid
        _.clearElement(this.getGui());
    }
}