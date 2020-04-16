export class Meiti
{
    static huoqumeiti(): Promise<MediaStream>
    {
        return navigator.mediaDevices.getUserMedia()
    }
}
