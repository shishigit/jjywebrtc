export class JJYUserMedia
{
    static huoqumeiti(): Promise<MediaStream>
    {
        return navigator.mediaDevices.getUserMedia({video: true, audio: true})
    }
}
